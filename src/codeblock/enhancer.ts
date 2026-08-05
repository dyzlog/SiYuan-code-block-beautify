/**
 * 代码块美化插件 - 扫描调度模块
 *
 * 通过 MutationObserver + 思源 eventBus 事件扫描文档中的代码块，
 * 对新增代码块调用行号渲染（linenumbers），并负责插件的启动/销毁/设置变更。
 */
import type { Plugin } from "siyuan"
import type { CodeBlockSettings } from "./settings"
import {
  ENHANCED_VALUE,
  scheduleIdle,
} from "../utils/dom"
import {
  getOverlay,
  removeOverlay,
} from "../utils/overlay"
import { countVisibleLines } from "../utils/text-range"
import {
  TEXTURE_CLASSES,
} from "./background"
import { clearFoldState } from "./folding"
import { renderLineNumbers } from "./linenumbers"
import {
  cleanupAll,
  enhanceAll,
  getSelfSelectors,
  rerenderBlock,
} from "./registry"

const CODE_BLOCK_SELECTOR = ".code-block"
const SCAN_DEBOUNCE_MS = 200

/** Node.ELEMENT_NODE（1）：不依赖全局 Node，保证在任意 JS 环境（含测试隔离环境）可解析 */
const ELEMENT_NODE = 1

const BEAUTIFIED_CLASS = "cb-beautified"
const WITH_LINENUMBERS_CLASS = "cb-with-linenumbers"
const LINENUMBERS_CLASS = "cb-linenumbers"

let plugin: Plugin | null = null
let settings: CodeBlockSettings | null = null
let observer: MutationObserver | null = null
let scanScheduled = false

/** 思源 protyle 加载/切换时触发：先扫描（文档切换后仅增强当前文档） */
function onProtyleEvent() {
  scheduleScan("all")
}

/** 文档关闭前清理注入元素，防止保存时序列化污染 */
function onProtyleDestroy() {
  clearEnhancements()
}

/** 待处理的代码块（MutationObserver 增量收集，滚动中避免全量遍历文档） */
const pendingBlocks = new Set<HTMLElement>()
/** 待执行扫描的范围（all 优先级更高，可覆盖 pending） */
let scanScope: "pending" | "all" = "pending"

export function initCodeBlockEnhancer(p: Plugin, s: CodeBlockSettings) {
  plugin = p
  settings = s
  p.eventBus.on("loaded-protyle-dynamic", onProtyleEvent)
  // 文档关闭/切换前清理注入元素，防止被思源序列化保存导致污染
  p.eventBus.on("destroy-protyle", onProtyleDestroy)
  p.eventBus.on("switch-protyle", onProtyleEvent)
  observer = new MutationObserver((mutations) => {
    if (!settings?.enabled) {
      return
    }
    // 忽略插件自身注入的元素（行号列/当前行高亮/统计角标/装饰栏/缩进线/省略行）
    // 及其内部变化——否则我们自己的 DOM 增删会触发扫描，形成循环。
    // 装饰类选择器由注册表自动聚合（新模块自动纳入），行号列/省略行手写补充。
    const SELF_SELECTOR = [
      getSelfSelectors(),
      `.${LINENUMBERS_CLASS}`,
      ".cb-linenumbers *",
      ".cb-overlay",
      ".cb-overlay *",
      ".cb-fold-ellipsis",
    ].filter(Boolean).join(",")
    // 增量收集：只登记「变化相关的代码块」（新增节点 / 变化节点的祖先代码块）
    for (const m of mutations) {
      const target = m.target as Element | null
      if (target && target.closest(SELF_SELECTOR)) {
        continue
      }
      // 代码块被删除：移除兄弟 overlay（关键：overlay 是 codeBlock 的兄弟节点，不随其移除，
      // 思源动态加载移除 .code-block 时会残留在 wysiwyg 中，fixed 定位停驻视口持续显示）
      for (const node of m.removedNodes) {
        if (node.nodeType !== ELEMENT_NODE) {
          continue
        }
        const el = node as Element
        // 被移除节点本身或其子树中可能包含多个代码块，全部清理
        const removed = el.matches(CODE_BLOCK_SELECTOR)
          ? [el]
          : Array.from(el.querySelectorAll(CODE_BLOCK_SELECTOR))
        for (const block of removed) {
          removeOverlay(block as HTMLElement)
        }
      }
      for (const node of m.addedNodes) {
        if (node.nodeType !== ELEMENT_NODE) {
          continue
        }
        const el = node as Element
        if (el.matches(SELF_SELECTOR)) {
          continue
        }
        // 自身是代码块，或整体插入的容器内部包含代码块：
        // 思源动态加载/列表块等场景一次插入一个容器，addedNodes 只有容器自身，
        // 必须向下收集子树中的代码块（仅 closest 向上会漏掉）
        const blocks = el.matches(CODE_BLOCK_SELECTOR)
          ? [el]
          : Array.from(el.querySelectorAll(CODE_BLOCK_SELECTOR))
        for (const block of blocks) {
          pendingBlocks.add(block as HTMLElement)
        }
        // 插入到代码块内部的内容变化（祖先链上是代码块）
        const ancestor = el.closest(CODE_BLOCK_SELECTOR)
        if (ancestor && !blocks.includes(ancestor)) {
          pendingBlocks.add(ancestor as HTMLElement)
        }
      }
      if (target) {
        const block = target.closest(CODE_BLOCK_SELECTOR)
        if (block) {
          pendingBlocks.add(block as HTMLElement)
        }
      }
    }
    if (pendingBlocks.size === 0) {
      return
    }
    // 大量变化（整页重建等）升级为全量扫描
    if (pendingBlocks.size > 100) {
      pendingBlocks.clear()
      scheduleScan("all")
      return
    }
    scheduleScan("pending")
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
  scan()
}

export function destroyCodeBlockEnhancer() {
  if (plugin) {
    plugin.eventBus.off("loaded-protyle-dynamic", onProtyleEvent)
    plugin.eventBus.off("switch-protyle", onProtyleEvent)
    plugin.eventBus.off("destroy-protyle", onProtyleDestroy)
  }
  if (observer) {
    observer.disconnect()
    observer = null
  }
  // 卸载时完整清理（含长代码折叠状态）
  clearEnhancements(false)
  clearRenderObservers()




  plugin = null
  settings = null
}

/** 设置变更后：移除旧增强并全量重扫 */
export function updateSettings(s: CodeBlockSettings) {
  settings = s
  resetAll()
}

function scheduleScan(scope: "pending" | "all" = "pending") {
  if (scope === "all") {
    scanScope = "all"
  }
  if (scanScheduled) {
    return
  }
  scanScheduled = true
  // 空闲时扫描（渲染高峰期不抢主线程），兜底 setTimeout
  const run = () => {
    scanScheduled = false
    const s = scanScope
    scanScope = "pending"
    scan(s)
  }
  scheduleIdle(run, Math.max(SCAN_DEBOUNCE_MS, 300))
}

function scan(scope: "pending" | "all" = "all") {
  if (!settings?.enabled) {
    return
  }
  // 增量扫描：只处理变化相关的代码块（滚动中避免全量遍历文档）
  if (scope === "pending") {
    if (pendingBlocks.size === 0) {
      return
    }
    const blocks = [...pendingBlocks]
    pendingBlocks.clear()
    for (const block of blocks) {
      processBlock(block)
    }
    return
  }
  // 全量扫描（文档切换 / 初始化 / 设置变更）
  pendingBlocks.clear()
  // 兜底：清理与代码块失联的孤儿 overlay（removedNodes 已做清理，这里是最后防线，
  // 覆盖代码块被移动/替换等 MutationObserver 未捕获的边角场景——overlay 固定定位，
  // 失联后会停驻在视口内持续显示）
  document.querySelectorAll<HTMLElement>(".cb-overlay").forEach((ov) => {
    if (!ov.previousElementSibling?.matches(CODE_BLOCK_SELECTOR)) {
      ov.remove()
    }
  })
  document.querySelectorAll<HTMLElement>(CODE_BLOCK_SELECTOR).forEach((block) => {
    processBlock(block)
  })
}

/** 处理单个代码块：已增强则校验，否则增强 */
function processBlock(block: HTMLElement) {
  if (block.dataset.cbEnhanced === ENHANCED_VALUE) {
    verify(block)
  } else {
    enhance(block)
  }
}

/** 元素是否可见（祖先链无 display:none 等，非当前文档的 protyle 不可见） */
function isElementVisible(el: HTMLElement): boolean {
  // checkVisibility 不触发布局（滚动中 scan 遍历所有代码块时避免强制 reflow）；
  // 旧浏览器降级为 offsetParent / getClientRects
  if (typeof el.checkVisibility === "function") {
    return el.checkVisibility()
  }
  return el.offsetParent !== null || el.getClientRects().length > 0
}

/** 待修正的行号列（行数变化后防抖重建，避免滚动中重建导致错位） */
const pendingReform = new WeakMap<HTMLElement, number>()

/** 校验已增强的代码块：若思源重渲染导致注入元素丢失，则补齐 */
function verify(codeBlock: HTMLElement) {
  if (!settings) {
    return
  }
  const hljs = codeBlock.querySelector<HTMLElement>(".hljs")
  // 装饰补齐（注册表幂等）：背景/纹理/当前行高亮/统计角标/active guide/长代码条
  enhanceAll({
    codeBlock,
    hljs,
    settings,
  })
  if (settings.showLineNumber || settings.foldEnabled) {
    const existing = getOverlay(codeBlock).querySelector(`.${LINENUMBERS_CLASS}`)
    if (!existing) {
      // 行号列丢失（思源重建代码块）→ 立即补齐
      renderLineNumbers(codeBlock, settings)
      rerenderBlock(codeBlock)
    } else {
      // 行号列存在但行数变化（思源动态处理 .hljs 内容）：
      // 不立即重建（滚动中重建会重置 transform、导致行号错位/空白），
      // 防抖到滚动停止后再修正
      const expected = hljs ? countVisibleLines(hljs.textContent ?? "") : 0
      const existingCount = getOverlay(codeBlock).querySelectorAll(`.${LINENUMBERS_CLASS} .cb-linenumber`).length
      if (existingCount !== expected) {
        const timer = pendingReform.get(codeBlock)
        if (timer) {
          window.clearTimeout(timer)
        }
        pendingReform.set(codeBlock, window.setTimeout(() => {
          pendingReform.delete(codeBlock)
          if (!settings || !codeBlock.isConnected || codeBlock.dataset.cbEnhanced !== ENHANCED_VALUE) {
            return
          }
          renderLineNumbers(codeBlock, settings)
          rerenderBlock(codeBlock)
        }, 500))
      }
    }
  }
}

function enhance(codeBlock: HTMLElement) {
  if (!settings?.enabled) {
    return
  }
  if (codeBlock.dataset.cbEnhanced === ENHANCED_VALUE) {
    return
  }
  codeBlock.dataset.cbEnhanced = ENHANCED_VALUE
  codeBlock.classList.add(BEAUTIFIED_CLASS)
  const hljs = codeBlock.querySelector<HTMLElement>(".hljs")
  // 装饰增强：背景/纹理/当前行高亮/统计角标/active guide/长代码条（注册表统一调度）
  enhanceAll({
    codeBlock,
    hljs,
    settings,
  })
  if (settings.showLineNumber || settings.foldEnabled) {
    // 行号列渲染会逐行测量（强制布局）——长文档只在可视区渲染，
    // 滚动接近（提前 200px）时再渲染其余代码块，避免加载卡顿
    if (isElementVisible(codeBlock)) {
      renderLineNumbers(codeBlock, settings)
    } else {
      observeForRender(codeBlock)
    }
  }
}

/** 等待进入视口后渲染行号列（长文档加载不阻塞；进入视口后只渲染一次） */
const renderObservers = new Map<HTMLElement, IntersectionObserver>()

function observeForRender(codeBlock: HTMLElement) {
  if (renderObservers.has(codeBlock)) {
    return
  }
  const io = new IntersectionObserver((entries) => {
    const block = entries[0].target as HTMLElement
    // 触发即清理（块被移除时也会触发一次，避免观察器累积泄漏）
    renderObservers.delete(block)
    io.disconnect()
    if (entries[0].isIntersecting && settings) {
      renderLineNumbers(block, settings)
      rerenderBlock(block)
    }
  }, { rootMargin: "200px" })
  renderObservers.set(codeBlock, io)
  io.observe(codeBlock)
}

/** 卸载时断开所有待渲染观察器 */
function clearRenderObservers() {
  renderObservers.forEach((io) => io.disconnect())
  renderObservers.clear()
}



/**
 * 移除增强并清理注入元素。
 * @param preserveLongCode 设置变更（true）时保留长代码折叠状态，
 *                         保存设置后折叠保持、阈值变化自动调整；卸载（false）时完整清理
 */
function clearEnhancements(preserveLongCode = true) {
  document.querySelectorAll<HTMLElement>(`.code-block.${BEAUTIFIED_CLASS}`).forEach((block) => {
    block.classList.remove(BEAUTIFIED_CLASS, WITH_LINENUMBERS_CLASS, ...TEXTURE_CLASSES)
    delete block.dataset.cbEnhanced
    block.style.removeProperty("--cb-linenumber-width")
    block.style.removeProperty("--cb-line-font-size")
    block.style.removeProperty("--cb-font-family")
    // 装饰清理（注册表统一：当前行/统计角标/active guide/长代码条/背景纹理）
    cleanupAll(block, preserveLongCode)
    // 行号列/缩进线/主题栏等全部随 overlay 整体移除（各行号列不在 codeBlock 子树内）
    removeOverlay(block)
    // 展开代码内折叠并清理状态，恢复原始内容（折叠省略行随 unfoldAll 移除）
    clearFoldState(block)
  })
}

function resetAll() {
  clearEnhancements()
  scan()
}
