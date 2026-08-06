/**
 * 代码块美化插件 - 扫描调度模块
 *
 * 通过 MutationObserver + 思源 eventBus 事件扫描文档中的代码块，
 * 对新增代码块调用装饰增强（注册表），并负责插件的启动/销毁/设置变更。
 */
import type { Plugin } from "siyuan"
import type { CodeBlockSettings } from "./settings"
import {
  ENHANCED_VALUE,
  scheduleIdle,
} from "../utils/dom"
import {
  destroyOverlaySystem,
  removeOverlay,
} from "../utils/overlay"
import {
  TEXTURE_CLASSES,
} from "./background"
import {
  cleanupAll,
  enhanceAll,
  getSelfSelectors,
} from "./registry"
// 装饰模块（副作用：各自 registerDecor 注册，供 enhanceAll 调用）——
// 必须显式 import，否则 Vite tree-shake 会移除未引用的模块，导致对应功能失效
import "./code-stats"
import "./current-line"
import "./longcode"

const CODE_BLOCK_SELECTOR = ".code-block"
/** 扫描防抖下限（ms）——scheduleIdle 空闲调度的基础等待 */
const SCAN_DEBOUNCE_MS = 300

/** Node.ELEMENT_NODE（1）：不依赖全局 Node，保证在任意 JS 环境（含测试隔离环境）可解析 */
const ELEMENT_NODE = 1

const BEAUTIFIED_CLASS = "cb-beautified"

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

/** 自身注入元素选择器缓存（装饰模块注册后固定，避免每次 mutation 重算） */
let cachedSelfSelector = ""

function selfSelectorCache(): string {
  if (!cachedSelfSelector) {
    cachedSelfSelector = [
      getSelfSelectors(),
      ".cb-overlay",
      ".cb-overlay *",
    ].filter(Boolean).join(",")
  }
  return cachedSelfSelector
}

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
    // 忽略插件自身注入的元素（当前行高亮/统计角标/装饰栏）
    // 及其内部变化——否则我们自己的 DOM 增删会触发扫描，形成循环。
    // 装饰类选择器由注册表自动聚合（新模块自动纳入）。
    const SELF_SELECTOR = selfSelectorCache()
    // 增量收集：只登记「变化相关的代码块」（新增节点 / 变化节点的祖先代码块）
    for (const m of mutations) {
      const target = m.target as Element | null
      if (target && target.closest(SELF_SELECTOR)) {
        continue
      }
      // 代码块被删除：移除兄弟 overlay（关键：overlay 是 codeBlock 的兄弟节点，不随其移除，
      // 思源动态加载移除 .code-block 时会残留在 wysiwyg 中持续显示）
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
  clearPendingEnhanceObservers()
  clearEnhancements(false)
  // 销毁 overlay 系统（卸载 scroll 监听 + 断开 ResizeObserver + 清空状态）
  destroyOverlaySystem()
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
  scheduleIdle(run, SCAN_DEBOUNCE_MS)
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
  // 覆盖代码块被移动/替换等 MutationObserver 未捕获的边角场景）
  document.querySelectorAll<HTMLElement>(".cb-overlay").forEach((ov) => {
    if (!ov.previousElementSibling?.matches(CODE_BLOCK_SELECTOR)) {
      ov.remove()
    }
  })
  // 分批处理：避免一次同步遍历全部代码块阻塞主线程（长文档初始化不卡）
  const blocks = Array.from(document.querySelectorAll<HTMLElement>(CODE_BLOCK_SELECTOR))
  const BATCH = 20
  let i = 0
  const nextBatch = () => {
    const end = Math.min(i + BATCH, blocks.length)
    for (; i < end; i++) {
      processBlock(blocks[i])
    }
    if (i < blocks.length) {
      // 空闲调度下一批（requestIdleCallback 优先，回退 setTimeout）
      scheduleIdle(nextBatch, 100)
    }
  }
  nextBatch()
}

/** 等待进入视口后增强的代码块（长文档初始化不阻塞；进入视口前 200px 才增强） */
const pendingEnhanceBlocks = new Set<HTMLElement>()
/** 共享视口观察器（单实例观察所有待增强块，避免每块一个 IO） */
let enhanceObserver: IntersectionObserver | null = null

/** 确保共享观察器已创建（惰性，首次调用时） */
function ensureEnhanceObserver() {
  if (enhanceObserver) {
    return
  }
  enhanceObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const block = entry.target as HTMLElement
      if (!entry.isIntersecting) {
        // 块当前不在视口（或 200px 预加载区）：保留观察，滚动进入视口再触发。
        // 不能 unobserve——否则初始不可见的块将永远不被增强（用户反馈滚动后不渲染）
        continue
      }
      pendingEnhanceBlocks.delete(block)
      enhanceObserver?.unobserve(block)
      if (settings) {
        enhance(block)
      }
    }
    // 无待观察块时断开观察器（释放资源）
    if (pendingEnhanceBlocks.size === 0) {
      enhanceObserver?.disconnect()
      enhanceObserver = null
    }
  }, { rootMargin: "200px" })
}

/** 处理单个代码块：已增强则轻量校验；未增强一律交给共享 IO（进入视口才增强） */
function processBlock(block: HTMLElement) {
  if (block.dataset.cbEnhanced === ENHANCED_VALUE) {
    verify(block)
    return
  }
  // 不在这里做任何可见性判断/布局读取——统一交给 IntersectionObserver：
  // 浏览器内部判断可见性（rootMargin 200px），进入视口才触发 enhance。
  // 打开文档时视口外的块零测量、零布局读取（用户要求：只渲染看到 + 临近的少量块）
  observeForEnhance(block)
}

/** 监听代码块进入视口后增强（共享观察器；触发即移除该块） */
function observeForEnhance(codeBlock: HTMLElement) {
  if (pendingEnhanceBlocks.has(codeBlock)) {
    return
  }
  pendingEnhanceBlocks.add(codeBlock)
  ensureEnhanceObserver()
  enhanceObserver?.observe(codeBlock)
}

/** 卸载时断开共享观察器并清空待增强队列 */
function clearPendingEnhanceObservers() {
  enhanceObserver?.disconnect()
  enhanceObserver = null
  pendingEnhanceBlocks.clear()
}

/**
 * 轻量校验已增强的代码块：仅检查 overlay 是否仍在，缺失才重新增强。
 * 不再全量 enhanceAll——那会对视口外的块重复测量（布局读取），是卡顿热点。
 */
function verify(codeBlock: HTMLElement) {
  if (!settings) {
    return
  }
  // 检查 overlay 兄弟节点是否还在（思源重渲染若移除了它，需重新增强）
  const ov = codeBlock.nextElementSibling
  if (!ov || !ov.classList.contains("cb-overlay")) {
    enhance(codeBlock)
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
  // 装饰增强：背景/纹理/当前行高亮/统计角标/长代码条（注册表统一调度）
  enhanceAll({
    codeBlock,
    hljs,
    settings,
  })
}

/**
 * 移除增强并清理注入元素。
 * @param preserveLongCode 设置变更（true）时保留长代码折叠状态，
 *                         保存设置后折叠保持、阈值变化自动调整；卸载（false）时完整清理
 */
function clearEnhancements(preserveLongCode = true) {
  document.querySelectorAll<HTMLElement>(`.code-block.${BEAUTIFIED_CLASS}`).forEach((block) => {
    block.classList.remove(BEAUTIFIED_CLASS, ...TEXTURE_CLASSES)
    delete block.dataset.cbEnhanced
    // 装饰清理（注册表统一：当前行/统计角标/长代码条/背景纹理）
    cleanupAll(block, preserveLongCode)
    // 装饰元素全部随 overlay 整体移除（不在 codeBlock 子树内）
    removeOverlay(block)
  })
}

function resetAll() {
  clearEnhancements()
  scan()
}
