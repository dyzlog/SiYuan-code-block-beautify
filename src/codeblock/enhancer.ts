/**
 * 代码块美化插件 - 扫描调度模块
 *
 * 通过 MutationObserver + 思源 eventBus 事件扫描文档中的代码块，
 * 对新增代码块调用行号渲染（linenumbers），并负责插件的启动/销毁/设置变更。
 */
import type { Plugin } from "siyuan"
import type { CodeBlockSettings } from "./settings"
import { ENHANCED_VALUE } from "../utils/dom"
import { countVisibleLines } from "../utils/text-range"
import {
  initCodeStats,
  removeCodeStats,
} from "./code-stats"
import {
  initCurrentLine,
  removeCurrentLine,
} from "./current-line"
import { clearFoldState } from "./folding"
import { renderLineNumbers } from "./linenumbers"
import { clearLongCodeBar } from "./longcode"
import {
  applyBackgroundTheme,
  clearAllMagicCircles,
  removeMagicCircles,
} from "./magic-circle"
import { rerenderBlock } from "./registry"

const CODE_BLOCK_SELECTOR = ".code-block"
const SCAN_DEBOUNCE_MS = 200

const BEAUTIFIED_CLASS = "cb-beautified"
const WITH_LINENUMBERS_CLASS = "cb-with-linenumbers"
const LINENUMBERS_CLASS = "cb-linenumbers"

let plugin: Plugin | null = null
let settings: CodeBlockSettings | null = null
let observer: MutationObserver | null = null
let scanScheduled = false

/** 思源 protyle 加载/切换时触发：先清理所有魔法阵（文档切换只保留当前文档），再扫描 */
function onProtyleEvent() {
  clearAllMagicCircles()
  scan()
}

export function initCodeBlockEnhancer(p: Plugin, s: CodeBlockSettings) {
  plugin = p
  settings = s
  p.eventBus.on("loaded-protyle-dynamic", onProtyleEvent)
  p.eventBus.on("switch-protyle", onProtyleEvent)
  observer = new MutationObserver((mutations) => {
    // 忽略行号列（我们自己的渲染产物）内部的 DOM 变化，
    // 否则 render 重建行号列会再次触发扫描，形成无限渲染循环
    const selfMutation = mutations.some((m) => {
      const target = m.target as HTMLElement | null
      return !!target && !!target.closest(`.${LINENUMBERS_CLASS}`)
    })
    if (selfMutation) {
      return
    }
    scheduleScan()
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
  }
  if (observer) {
    observer.disconnect()
    observer = null
  }
  // 卸载时完整清理（含长代码折叠状态）
  clearEnhancements(false)
  plugin = null
  settings = null
}

/** 设置变更后：移除旧增强并全量重扫 */
export function updateSettings(s: CodeBlockSettings) {
  settings = s
  resetAll()
}

function scheduleScan() {
  if (scanScheduled) {
    return
  }
  scanScheduled = true
  window.setTimeout(() => {
    scanScheduled = false
    scan()
  }, SCAN_DEBOUNCE_MS)
}

function scan() {
  if (!settings?.enabled) {
    return
  }
  document.querySelectorAll<HTMLElement>(CODE_BLOCK_SELECTOR).forEach((block) => {
    // 非当前文档（不可见）的代码块：不渲染魔法阵，确保无残留（省资源）
    if (!isElementVisible(block)) {
      removeMagicCircles(block)
      return
    }
    if (block.dataset.cbEnhanced === ENHANCED_VALUE) {
      verify(block)
    } else {
      enhance(block)
    }
  })
}

/** 元素是否可见（祖先链无 display:none 等，非当前文档的 protyle 不可见） */
function isElementVisible(el: HTMLElement): boolean {
  return el.offsetParent !== null || el.getClientRects().length > 0
}

/** 待修正的行号列（行数变化后防抖重建，避免滚动中重建导致错位） */
const pendingReform = new WeakMap<HTMLElement, number>()

/** 校验已增强的代码块：若思源重渲染导致注入元素丢失，则补齐 */
function verify(codeBlock: HTMLElement) {
  if (!settings) {
    return
  }
  if (settings.showLineNumber || settings.foldEnabled) {
    const existing = codeBlock.querySelector(`.${LINENUMBERS_CLASS}`)
    if (!existing) {
      // 行号列丢失（思源重建代码块）→ 立即补齐
      renderLineNumbers(codeBlock, settings)
      rerenderBlock(codeBlock)
    } else {
      // 行号列存在但行数变化（思源动态处理 .hljs 内容）：
      // 不立即重建（滚动中重建会重置 transform、导致行号错位/空白），
      // 防抖到滚动停止后再修正
      const hljs = codeBlock.querySelector<HTMLElement>(".hljs")
      const expected = hljs ? countVisibleLines(hljs.textContent ?? "") : 0
      const existingCount = codeBlock.querySelectorAll(`.${LINENUMBERS_CLASS} .cb-linenumber`).length
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
  applyBackgroundTheme(codeBlock, settings)
  applyBackgroundTexture(codeBlock, settings.backgroundTheme)
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
  applyBackgroundTheme(codeBlock, settings)
  applyBackgroundTexture(codeBlock, settings.backgroundTheme)
  // 当前行高亮（光标所在行）
  const hljs = codeBlock.querySelector<HTMLElement>(".hljs")
  if (hljs) {
    initCurrentLine(codeBlock, hljs, settings.currentLineHighlight)
  }
  // 代码统计角标
  initCodeStats(codeBlock, settings.codeStats)
  if (settings.showLineNumber || settings.foldEnabled) {
    renderLineNumbers(codeBlock, settings)
  }
}

/** 背景纹理：非魔法阵的 CSS 纹理主题（class 控制） */
const TEXTURE_CLASSES = ["starfield", "grid", "dots", "matrix"].map((t) => `cb-bg-${t}`)

function applyBackgroundTexture(codeBlock: HTMLElement, theme: string) {
  codeBlock.classList.remove(...TEXTURE_CLASSES)
  if (TEXTURE_CLASSES.includes(`cb-bg-${theme}`)) {
    codeBlock.classList.add(`cb-bg-${theme}`)
  }
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
    block.style.removeProperty("--cb-line-height")
    block.style.removeProperty("--cb-line-font-size")
    block.style.removeProperty("--cb-font-family")
    block.querySelectorAll(`.${LINENUMBERS_CLASS}`).forEach((el) => el.remove())
    block.querySelectorAll(".cb-indent-guides").forEach((el) => el.remove())
    removeMagicCircles(block)
    removeCurrentLine(block)
    removeCodeStats(block)
    if (!preserveLongCode) {
      clearLongCodeBar(block)
    }
    // 展开代码内折叠并清理状态，恢复原始内容
    clearFoldState(block)
  })
}

function resetAll() {
  clearEnhancements()
  scan()
}
