/**
 * 长代码折叠：应对长篇代码。
 *
 * 超过设定行数的代码块，顶部显示主题装饰栏、底部显示「收起/展开」按钮；
 * 点击后代码块只显示前 N 行，按钮变为「展开」；展开后可滚动预览全部内容。
 * 不修改 .hljs 内容，仅通过 max-height 控制显示。
 *
 * 折叠状态持久化在 .code-block 的 data 属性上：设置保存/重渲染后折叠状态保持，
 * 固定行数（阈值）变化时自动用新阈值重新计算高度。
 */

import type { CodeBlockSettings } from "./settings"
import { getCodeText } from "../utils/dom"
import { getOverlay } from "../utils/overlay"
import { countVisibleLines } from "../utils/text-range"
import { measureLineAt } from "./line-measure-service"
import {
  registerDecor,
} from "./registry"

const BAR_CLASS = "cb-longcode-bar"
const BAR_SCROLLING_CLASS = "cb-longcode-bar--scrolling"
const BTN_CLASS = "cb-longcode-btn"
const BTN_SCROLLING_CLASS = "cb-longcode-btn--scrolling"
const DOTS_CLASS = "cb-longcode-dots"
const WIN_CLASS = "cb-longcode-win"
const CHROME_CLASS = "cb-longcode-chrome"
const TERMINAL_CLASS = "cb-longcode-terminal"
const CODESYM_CLASS = "cb-longcode-codesym"
const FOLDED_ATTR = "cbLongFolded"

interface LongCodeFoldState {
  /** 折叠时的固定高度（px） */
  height: number
  /** 计算该高度时使用的阈值（行数），阈值变化时需重新计算 */
  threshold: number
}

/** 折叠高度缓存（同一阈值内稳定，避免滚动/重渲染测量抖动） */
const foldStates = new WeakMap<HTMLElement, LongCodeFoldState>()

function applyFold(codeBlock: HTMLElement, folded: boolean, topNHeight: number) {
  const hljs = codeBlock.querySelector<HTMLElement>(".hljs")
  // 只给 .hljs 限高（内容溢出触发内部滚动预览），.code-block 不设 max-height，
  // 使其自适应 .hljs 实际高度，避免滚动到底时底部内容被外层裁剪
  if (hljs) {
    hljs.style.maxHeight = folded && topNHeight > 0 ? `${topNHeight}px` : ""
  }
}

function updateBtn(btn: HTMLButtonElement, folded: boolean) {
  btn.textContent = folded ? "展开" : "收起"
}

/** 当前是否折叠（data 属性持久化） */
function isFolded(codeBlock: HTMLElement): boolean {
  return codeBlock.dataset[FOLDED_ATTR] === "1"
}

/**
 * 滚动文档使代码块顶部（第一行）落在滚动容器视口中间。
 * 用于长代码收起后：直接看到折叠效果，无需手动下滑。
 */
function centerBlockInViewport(codeBlock: HTMLElement) {
  const scroller = codeBlock.closest<HTMLElement>(".protyle-content")
  if (!scroller) {
    return
  }
  // 折叠后代码块高度已变，先读真实位置
  const scrollerRect = scroller.getBoundingClientRect()
  const blockRect = codeBlock.getBoundingClientRect()
  // 让代码块顶部位于视口垂直中心：目标偏移 = 视口高/2
  const targetOffset = scrollerRect.height / 2
  const currentOffset = blockRect.top - scrollerRect.top
  scroller.scrollTop += currentOffset - targetOffset
}

/** 解析折叠高度：同一阈值内用缓存（防抖动），阈值变化时用新高度并更新缓存 */
function resolveFoldHeight(codeBlock: HTMLElement, threshold: number, topNHeight: number): number {
  const cached = foldStates.get(codeBlock)
  if (cached && cached.threshold === threshold && cached.height > 0) {
    return cached.height
  }
  if (topNHeight > 0) {
    foldStates.set(codeBlock, {
      height: topNHeight,
      threshold,
    })
  }
  return topNHeight
}

/** 在顶部栏左侧追加一组圆点 */
function appendDots(bar: HTMLElement, dotClasses: string[]) {
  const dots = document.createElement("div")
  dots.className = DOTS_CLASS
  for (const cls of dotClasses) {
    const dot = document.createElement("span")
    dot.className = `cb-longcode-dot ${cls}`
    dots.appendChild(dot)
  }
  bar.appendChild(dots)
}

/** 渲染顶部栏主题装饰（mac / windows / ubuntu / chrome / terminal / codesym） */
function renderThemeDecor(bar: HTMLElement, themeStyle: string) {
  // 统一标记风格 class
  const styleClasses = ["mac", "windows", "ubuntu", "chrome", "terminal", "codesym"].map((s) => `${BAR_CLASS}--${s}`)
  bar.classList.remove(...styleClasses)
  if (styleClasses.includes(`${BAR_CLASS}--${themeStyle}`)) {
    bar.classList.add(`${BAR_CLASS}--${themeStyle}`)
  }
  bar.querySelectorAll(`.${DOTS_CLASS}, .${WIN_CLASS}, .${CHROME_CLASS}, .${TERMINAL_CLASS}, .${CODESYM_CLASS}`).forEach((el) => el.remove())
  if (themeStyle === "mac") {
    // Mac 风格：左侧红黄绿圆点
    appendDots(bar, ["cb-longcode-dot--red", "cb-longcode-dot--yellow", "cb-longcode-dot--green"])
  } else if (themeStyle === "ubuntu") {
    // Ubuntu 风格：左侧橙黄绿圆点
    appendDots(bar, ["cb-longcode-dot--orange", "cb-longcode-dot--amber", "cb-longcode-dot--green2"])
  } else if (themeStyle === "windows") {
    // Windows 风格：左侧窗口控制按钮（关闭 ✕ / 最大化 ▢ / 最小化 ─）
    const win = document.createElement("div")
    win.className = WIN_CLASS
    for (const ch of ["✕", "▢", "─"]) {
      const btn = document.createElement("span")
      btn.className = "cb-longcode-win-btn"
      btn.textContent = ch
      win.appendChild(btn)
    }
    bar.appendChild(win)
  } else if (themeStyle === "chrome") {
    // Chrome 标签风格：顶部标签页 + 新标签页加号
    const chrome = document.createElement("div")
    chrome.className = CHROME_CLASS
    const tab = document.createElement("span")
    tab.className = "cb-longcode-chrome-tab"
    tab.textContent = "代码"
    const plus = document.createElement("span")
    plus.className = "cb-longcode-chrome-plus"
    plus.textContent = "+"
    chrome.appendChild(tab)
    chrome.appendChild(plus)
    bar.appendChild(chrome)
  } else if (themeStyle === "terminal") {
    // 终端提示符：❯_ 提示符 + 极简色块
    const term = document.createElement("div")
    term.className = TERMINAL_CLASS
    term.textContent = "❯"
    const cursor = document.createElement("span")
    cursor.className = "cb-longcode-terminal-cursor"
    cursor.textContent = "_"
    term.appendChild(cursor)
    bar.appendChild(term)
  } else if (themeStyle === "codesym") {
    // 代码符号：</> 装饰
    const sym = document.createElement("div")
    sym.className = CODESYM_CLASS
    sym.textContent = "</>"
    bar.appendChild(sym)
  }
}

/** 已安装滚动虚化监听的代码块（防重复绑定） */
const fadeInstalled = new WeakSet<HTMLElement>()

/**
 * 安装滚动虚化：滚动 .hljs 时主题栏与按钮同时虚化，停止 300ms 后恢复。
 * 幂等（WeakSet 防重复 + AbortController 清理），每次长代码/主题栏渲染时调用，
 * 确保按钮创建后也生效。clearLongCodeBar 时 abort 解除监听，杜绝重建累积。
 */
const fadeControllers = new WeakMap<HTMLElement, AbortController>()
/** 收起按钮 click 委托的控制器（btn 重建时 abort 旧委托，杜绝累积） */
const clickControllers = new WeakMap<HTMLElement, AbortController>()

function ensureScrollFade(codeBlock: HTMLElement) {
  if (fadeInstalled.has(codeBlock)) {
    return
  }
  const hljs = codeBlock.querySelector<HTMLElement>(".hljs")
  if (!hljs) {
    return
  }
  fadeInstalled.add(codeBlock)
  const ac = new AbortController()
  fadeControllers.set(codeBlock, ac)
  let fadeTimer = 0
  hljs.addEventListener("scroll", () => {
    const ov = getOverlay(codeBlock)
    const bar = ov.querySelector<HTMLElement>(`.${BAR_CLASS}`)
    bar?.classList.add(BAR_SCROLLING_CLASS)
    const b = ov.querySelector<HTMLElement>(`.${BTN_CLASS}`)
    b?.classList.add(BTN_SCROLLING_CLASS)
    window.clearTimeout(fadeTimer)
    fadeTimer = window.setTimeout(() => {
      bar?.classList.remove(BAR_SCROLLING_CLASS)
      b?.classList.remove(BTN_SCROLLING_CLASS)
    }, 300)
  }, { signal: ac.signal })
}

function ensureThemeBar(codeBlock: HTMLElement): HTMLElement {
  let bar = getOverlay(codeBlock).querySelector<HTMLElement>(`.${BAR_CLASS}`)
  if (!bar) {
    bar = document.createElement("div")
    bar.className = BAR_CLASS
    bar.setAttribute("contenteditable", "false")
    getOverlay(codeBlock).appendChild(bar)
  }
  ensureScrollFade(codeBlock)
  return bar
}

/** 短代码块主题装饰栏：仅顶部风格装饰，无收起/展开按钮 */
function renderThemeBar(codeBlock: HTMLElement, themeStyle: string) {
  const bar = ensureThemeBar(codeBlock)
  // 短代码无折叠：确保不显示收起按钮与折叠状态
  bar.querySelector(`.${BTN_CLASS}`)?.remove()
  bar.classList.remove(BAR_SCROLLING_CLASS)
  renderThemeDecor(bar, themeStyle)
}

function renderLongCodeBar(
  codeBlock: HTMLElement,
  lineCount: number,
  threshold: number,
  topNHeight: number,
  themeStyle: string,
) {
  const wasFolded = isFolded(codeBlock)
  const isLong = lineCount > threshold
  if (!isLong && !wasFolded) {
    // 非长代码且未折叠：完整清理（复用 clearLongCodeBar）
    clearLongCodeBar(codeBlock)
    return
  }
  const bar = ensureThemeBar(codeBlock)
  let btn = bar.querySelector<HTMLButtonElement>(`.${BTN_CLASS}`)
  if (!btn) {
    btn = document.createElement("button")
    btn.type = "button"
    btn.className = BTN_CLASS
    btn.setAttribute("contenteditable", "false")
    // 按钮 pointer-events:none（不拦截鼠标，避免干扰思源文本选择 hit-test）。
    // 点击通过 codeBlock 上的 click 委托：判断点击坐标是否落在按钮矩形内。
    const toggle = () => {
      const folded = !isFolded(codeBlock)
      if (folded) {
        codeBlock.dataset[FOLDED_ATTR] = "1"
        foldStates.set(codeBlock, {
          height: topNHeight,
          threshold,
        })
      } else {
        delete codeBlock.dataset[FOLDED_ATTR]
        foldStates.delete(codeBlock)
      }
      applyFold(codeBlock, folded, folded ? topNHeight : 0)
      updateBtn(btn!, folded)
      // 收起后自动滚动：让代码块顶部（第一行）落在视口中间，直接看到折叠效果
      if (folded) {
        centerBlockInViewport(codeBlock)
      }
    }
    // 委托：仅当点击坐标命中按钮矩形时触发（click 冒泡自 codeBlock，
    // 不影响思源对代码块的其它点击处理）。
    // 用 AbortController 管理：btn 重建/清理时 abort 旧委托，杜绝累积
    clickControllers.get(codeBlock)?.abort()
    const clickAc = new AbortController()
    clickControllers.set(codeBlock, clickAc)
    codeBlock.addEventListener("click", (e: MouseEvent) => {
      const rect = btn?.getBoundingClientRect()
      if (rect && e.clientX >= rect.left && e.clientX <= rect.right
        && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        e.preventDefault()
        e.stopPropagation()
        toggle()
      }
    }, { signal: clickAc.signal })
    getOverlay(codeBlock).appendChild(btn)
  }
  // 恢复折叠状态（data 属性持久化），高度：同阈值用缓存，阈值变化自动调整
  const height = resolveFoldHeight(codeBlock, threshold, topNHeight)
  applyFold(codeBlock, wasFolded, wasFolded ? height : 0)
  // 装饰栏隐藏条件：默认主题（与语言标记重叠）或主题风格关闭
  if (isDefaultTheme() || !themeStyle) {
    bar.style.display = "none"
  } else {
    bar.style.display = ""
    renderThemeDecor(bar, themeStyle)
  }
  updateBtn(btn, wasFolded)
}

/** 完整清理长代码折叠（卸载时调用，恢复完整显示并清除状态） */
function clearLongCodeBar(codeBlock: HTMLElement) {
  fadeInstalled.delete(codeBlock)
  fadeControllers.get(codeBlock)?.abort()
  fadeControllers.delete(codeBlock)
  clickControllers.get(codeBlock)?.abort()
  clickControllers.delete(codeBlock)
  const ov = getOverlay(codeBlock)
  ov.querySelector(`.${BAR_CLASS}`)?.remove()
  ov.querySelector(`.${BTN_CLASS}`)?.remove()
  applyFold(codeBlock, false, 0)
  delete codeBlock.dataset[FOLDED_ATTR]
  foldStates.delete(codeBlock)
}

/**
 * 默认主题检测：思源内置主题（daylight/midnight）会把原生工具栏放代码块
 * 左上角，与主题装饰栏重叠。默认主题下隐藏装饰栏（圆点/符号），
 * 自定义主题（如 Asri）正常显示。
 */
function isDefaultTheme(): boolean {
  const w = window as unknown as {
    siyuan?: {
      config?: {
        appearance?: {
          mode?: number
          themeLight?: string
          themeDark?: string
        }
      }
    }
  }
  const cfg = w.siyuan?.config?.appearance
  if (!cfg) {
    return false
  }
  return (cfg.mode === 1 && cfg.themeDark === "midnight")
    || (cfg.mode === 0 && cfg.themeLight === "daylight")
}

/**
 * 长代码条整体调度（代码块增强时调用一次，内部策略自管）：
 * - 长代码 + 折叠开启 → 收起按钮 + 折叠态（装饰栏是否显示取决于主题风格开关与当前主题）
 * - 短代码 → 主题风格开启时渲染装饰栏（默认主题不显示，避免与语言标记重叠），否则清理
 */
function renderLongCodeSection(
  codeBlock: HTMLElement,
  hljs: HTMLElement,
  settings: CodeBlockSettings,
  text: string,
) {
  const showTheme = settings.themeStyleEnabled && settings.themeStyle
  const defaultTheme = isDefaultTheme()
  const lineCount = countVisibleLines(text)
  const isLong = settings.longCodeFold && lineCount > settings.longCodeThreshold
  // 长代码折叠独立于主题风格：即使主题风格关闭，折叠按钮仍应可用（issue #1）
  if (isLong) {
    // 只测量阈值行（第 n 行）的顶部与高度，用于收起高度
    const n = settings.longCodeThreshold
    const {
      top,
      height,
    } = measureLineAt(hljs, text, Math.min(n, lineCount) - 1)
    const hljsStyle = getComputedStyle(hljs)
    const padBottom = Number.parseFloat(hljsStyle.paddingBottom) || 0
    const borderV = (Number.parseFloat(hljsStyle.borderTopWidth) || 0)
      + (Number.parseFloat(hljsStyle.borderBottomWidth) || 0)
    const topNHeight = top > 0 ? top + height + padBottom + borderV : 0
    renderLongCodeBar(codeBlock, lineCount, n, topNHeight, showTheme ? settings.themeStyle : "")
    return
  }
  // 短代码：主题风格关闭或默认主题 → 清理装饰栏；否则渲染装饰栏
  if (!showTheme || defaultTheme) {
    clearLongCodeBar(codeBlock)
  } else {
    renderThemeBar(codeBlock, settings.themeStyle)
  }
}

registerDecor({
  selfSelector: ".cb-longcode-bar, .cb-longcode-btn",
  enhance: (ctx) => {
    // 长代码条/主题装饰栏渲染入口（原由行号渲染流程触发，行号列删除后改由注册表驱动）
    if (ctx.hljs) {
      renderLongCodeSection(ctx.codeBlock, ctx.hljs, ctx.settings, getCodeText(ctx.hljs))
    }
  },
  cleanup: (codeBlock, preserve) => {
    if (!preserve) {
      clearLongCodeBar(codeBlock)
    }
  },
})

