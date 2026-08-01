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

const BAR_CLASS = "cb-longcode-bar"
const BAR_SCROLLING_CLASS = "cb-longcode-bar--scrolling"
const BTN_CLASS = "cb-longcode-btn"
const BTN_SCROLLING_CLASS = "cb-longcode-btn--scrolling"
const DOTS_CLASS = "cb-longcode-dots"
const WIN_CLASS = "cb-longcode-win"
const CHROME_CLASS = "cb-longcode-chrome"
const FOLDED_ATTR = "cbLongFolded"
/** 主题风格在 documentElement 上的 class 前缀（如 cb-theme-chrome） */
const THEME_CLASS_PREFIX = "cb-theme-"

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
  if (folded && topNHeight > 0) {
    if (hljs) {
      hljs.style.maxHeight = `${topNHeight}px`
    }
  } else if (hljs) {
    hljs.style.maxHeight = ""
  }
}

function updateBtn(btn: HTMLButtonElement, folded: boolean) {
  btn.textContent = folded ? "展开" : "收起"
}

/** 当前是否折叠（data 属性持久化） */
export function isFolded(codeBlock: HTMLElement): boolean {
  return codeBlock.dataset[FOLDED_ATTR] === "1"
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

/** 渲染顶部栏主题装饰（mac / windows / ubuntu / chrome） */
function renderThemeDecor(bar: HTMLElement, themeStyle: string) {
  // 统一标记风格 class
  const styleClasses = ["mac", "windows", "ubuntu", "chrome"].map((s) => `${BAR_CLASS}--${s}`)
  bar.classList.remove(...styleClasses)
  if (styleClasses.includes(`${BAR_CLASS}--${themeStyle}`)) {
    bar.classList.add(`${BAR_CLASS}--${themeStyle}`)
  }
  bar.querySelectorAll(`.${DOTS_CLASS}, .${WIN_CLASS}, .${CHROME_CLASS}`).forEach((el) => el.remove())
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
  }
}

/**
 * 在 documentElement（html）上标记当前主题风格，供全局 CSS 适配
 * 思源原生右上角工具（语言/复制/更多）的配色。
 */
export function applyThemeStyleClass(themeStyle: string) {
  const root = document.documentElement
  root.classList.forEach((cls) => {
    if (cls.startsWith(THEME_CLASS_PREFIX)) {
      root.classList.remove(cls)
    }
  })
  if (themeStyle) {
    root.classList.add(`${THEME_CLASS_PREFIX}${themeStyle}`)
  }
}

/** 移除主题风格全局标记 */
export function clearThemeStyleClass() {
  applyThemeStyleClass("")
}

/**
 * 渲染长代码折叠：顶部主题装饰栏 + 底部「收起/展开」按钮。
 * @param codeBlock 代码块
 * @param lineCount 当前代码行数
 * @param threshold 固定行数阈值
 * @param topNHeight 前 N 行的高度（px，折叠时 max-height 用）
 * @param themeStyle 顶部栏主题风格（"" = 无，mac/windows/terminal/vscode/github/ubuntu/chrome）
 */
/** 确保顶部主题装饰栏存在（创建/复用，含滚动虚化监听） */
function ensureThemeBar(codeBlock: HTMLElement): HTMLElement {
  let bar = codeBlock.querySelector<HTMLElement>(`.${BAR_CLASS}`)
  if (!bar) {
    bar = document.createElement("div")
    bar.className = BAR_CLASS
    bar.setAttribute("contenteditable", "false")
    codeBlock.appendChild(bar)
    // 滚动查看时装饰栏与按钮虚化，停止滚动后恢复
    const hljs = codeBlock.querySelector<HTMLElement>(".hljs")
    if (hljs) {
      let fadeTimer = 0
      hljs.addEventListener("scroll", () => {
        bar?.classList.add(BAR_SCROLLING_CLASS)
        const b = codeBlock.querySelector<HTMLElement>(`.${BTN_CLASS}`)
        b?.classList.add(BTN_SCROLLING_CLASS)
        window.clearTimeout(fadeTimer)
        fadeTimer = window.setTimeout(() => {
          bar?.classList.remove(BAR_SCROLLING_CLASS)
          b?.classList.remove(BTN_SCROLLING_CLASS)
        }, 300)
      })
    }
  }
  return bar
}

/** 短代码块主题装饰栏：仅顶部风格装饰，无收起/展开按钮 */
export function renderThemeBar(codeBlock: HTMLElement, themeStyle: string) {
  const bar = ensureThemeBar(codeBlock)
  // 短代码无折叠：确保不显示收起按钮与折叠状态
  bar.querySelector(`.${BTN_CLASS}`)?.remove()
  bar.classList.remove(BAR_SCROLLING_CLASS)
  renderThemeDecor(bar, themeStyle)
}

export function renderLongCodeBar(
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
    btn.addEventListener("click", () => {
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
      // 收起 / 展开后：移除魔法阵，触发重扫在「当前可视区域」重新生成
      // （否则旧的魔法阵按展开时的高度分布，收起后会被裁剪、积压在固定行号处）
      codeBlock.querySelectorAll(".cb-magic-circle").forEach((el) => el.remove())
    })
    codeBlock.appendChild(btn)
  }
  // 恢复折叠状态（data 属性持久化），高度：同阈值用缓存，阈值变化自动调整
  const folded = wasFolded
  const height = resolveFoldHeight(codeBlock, threshold, topNHeight)
  applyFold(codeBlock, folded, folded ? height : 0)
  renderThemeDecor(bar, themeStyle)
  updateBtn(btn, folded)
}

/** 完整清理长代码折叠（卸载时调用，恢复完整显示并清除状态） */
export function clearLongCodeBar(codeBlock: HTMLElement) {
  codeBlock.querySelector(`.${BAR_CLASS}`)?.remove()
  codeBlock.querySelector(`.${BTN_CLASS}`)?.remove()
  applyFold(codeBlock, false, 0)
  delete codeBlock.dataset[FOLDED_ATTR]
  foldStates.delete(codeBlock)
}
