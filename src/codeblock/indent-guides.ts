/**
 * VS Code 风格缩进竖线（indent guides）。
 *
 * 解析层：按"缩进层级栈"计算每个缩进层级的竖线段
 * （缩进不足的行断开、空行/注释行继承缩进、禁止跨块连线）。
 * 渲染层：不修改 .hljs 内容，仅叠加背景视觉层（z-index -1），随滚动同步。
 * 虚拟化：只渲染可视窗口内的段（长代码滚动不重建全部竖线）。
 * active guide：光标所在缩进级别的竖线加深（VS Code 风格）。
 */
import type { GuideSegment } from "./indent-parser"
import {
  caretLine,
  forEachTextNode,
  setScrollOffset,
} from "../utils/dom"
import { getOverlay } from "../utils/overlay"
import {
  buildGuideSegments,
  computeIndentLevels,
  detectIndentWidth,
} from "./indent-parser"
import {
  registerDecor,
} from "./registry"

const INDENT_GUIDES_CLASS = "cb-indent-guides"
const INDENT_GUIDE_CLASS = "cb-indent-guide"
const ACTIVE_CLASS = "cb-indent-guide--active"

/** 少于该行数不虚拟化（短代码全量渲染，避免窗口计算开销） */
const VIRTUALIZE_THRESHOLD = 120
/** 可视窗口上下缓冲（行） */
const VIEW_BUFFER = 4

/** 每个代码块的缩进线渲染数据（供虚拟化窗口重建与 active 高亮复用） */
interface IndentGuideData {
  segments: GuideSegment[]
  tops: number[]
  heightAt: (i: number) => number
  indentWidth: number
  spaceWidth: number
  rainbow: boolean
  /** 每行缩进空格数（active guide 由光标行 → 缩进级别） */
  indents: number[]
}

const guideData = new WeakMap<HTMLElement, IndentGuideData>()

/**
 * 精确测量代码字体下单个空格的宽度。
 *  优先用 .hljs 内实际的缩进空格（Range 测量，字体与真实渲染一致），
 *  回退到同字体临时探针
 */
function measureSpaceWidth(hljs: HTMLElement): number {
  const range = document.createRange()
  let result = 0
  forEachTextNode(hljs, (node) => {
    if (result > 0) {
      return
    }
    const data = node.data
    const spaceCount = (data.match(/^ +/) ?? [""])[0].length
    if (spaceCount >= 2) {
      range.setStart(node, 0)
      range.setEnd(node, spaceCount)
      const rect = range.getBoundingClientRect()
      if (rect.width > 0) {
        result = rect.width / spaceCount
      }
    }
  })
  if (result > 0) {
    return result
  }
  // 回退：同字体临时探针
  const cs = getComputedStyle(hljs)
  const probe = document.createElement("span")
  probe.style.position = "absolute"
  probe.style.visibility = "hidden"
  probe.style.whiteSpace = "pre"
  probe.style.fontFamily = cs.fontFamily
  probe.style.fontSize = cs.fontSize
  probe.style.fontWeight = cs.fontWeight
  probe.textContent = "          " // 10 个空格
  document.body.appendChild(probe)
  const width = probe.getBoundingClientRect().width / 10
  probe.remove()
  return width > 0 ? width : (Number.parseFloat(cs.fontSize) * 0.6 || 8)
}

/** 计算可视窗口的行范围（用行坐标，比平均行高更准） */
function computeWindow(data: IndentGuideData, scrollTop: number, viewH: number): [number, number] {
  const total = data.tops.length
  if (total <= VIRTUALIZE_THRESHOLD) {
    return [0, total - 1]
  }
  let first = 0
  for (let i = 0; i < total; i++) {
    if (data.tops[i] + data.heightAt(i) >= scrollTop - VIEW_BUFFER * 20) {
      first = i
      break
    }
  }
  let last = total - 1
  for (let i = total - 1; i >= 0; i--) {
    if (data.tops[i] <= scrollTop + viewH + VIEW_BUFFER * 20) {
      last = i
      break
    }
  }
  return [first, last]
}

/** 渲染可视窗口内的竖线段（虚拟化核心） */
function renderWindow(guides: HTMLElement, data: IndentGuideData, first: number, last: number) {
  guides.textContent = ""
  const frag = document.createDocumentFragment()
  for (const seg of data.segments) {
    // 段裁剪到可视窗口：只渲染相交部分
    const s = Math.max(seg.start, first)
    const e = Math.min(seg.end, last)
    if (s > e) {
      continue
    }
    const top = data.tops[s]
    const bottom = data.tops[e] + data.heightAt(e)
    if (bottom <= top) {
      continue
    }
    const g = document.createElement("div")
    g.className = INDENT_GUIDE_CLASS
    g.dataset.level = String(seg.level)
    // 竖线对齐块起始行的缩进：(级别-1) × 缩进宽度。
    // 例如 1 级竖线在 x=0（与 `if` 的 `i` 正下方对齐），2 级在 4 空格处，3 级在 8 空格处
    g.style.left = `${(seg.level - 1) * data.indentWidth * data.spaceWidth}px`
    g.style.top = `${top}px`
    g.style.height = `${bottom - top}px`
    // 彩虹模式：不同缩进层级不同颜色（黄金角步进色相）；否则用统一色（CSS 变量）
    if (data.rainbow) {
      g.style.backgroundColor = `hsl(${(seg.level * 47) % 360} 75% 50% / 0.75)`
    }
    frag.appendChild(g)
  }
  guides.appendChild(frag)
}

/** 渲染缩进竖线（首次/内容变化时调用：计算并保存数据，按当前可视窗口渲染） */
export function renderIndentGuides(
  codeBlock: HTMLElement,
  hljs: HTMLElement,
  text: string,
  tops: number[],
  heightAt: (i: number) => number,
  rainbow = false,
) {
  let guides = getOverlay(codeBlock).querySelector<HTMLElement>(`.${INDENT_GUIDES_CLASS}`)
  if (!guides) {
    guides = document.createElement("div")
    guides.className = INDENT_GUIDES_CLASS
    guides.setAttribute("contenteditable", "false")
    getOverlay(codeBlock).appendChild(guides)
  }

  const indents = computeIndentLevels(text)
  if (indents.length === 0) {
    guideData.delete(codeBlock)
    guides.textContent = ""
    return
  }
  const spaceWidth = measureSpaceWidth(hljs)
  const indentWidth = detectIndentWidth(indents)
  const segments = buildGuideSegments(indents, indentWidth)
  const data: IndentGuideData = {
    segments,
    tops,
    heightAt,
    indentWidth,
    spaceWidth,
    rainbow,
    indents,
  }
  guideData.set(codeBlock, data)
  // 竖线层高度 = 代码块可视高度（折叠时同步缩小）
  // 超出部分由 .cb-overlay 的 overflow: hidden 裁剪
  guides.style.height = `${codeBlock.clientHeight}px`
  guides.style.width = `${codeBlock.clientWidth}px`
  guides.style.overflow = "hidden"
  // 按当前可视窗口渲染（虚拟化）
  const [first, last] = computeWindow(data, hljs.scrollTop || 0, codeBlock.clientHeight || hljs.clientHeight || 0)
  renderWindow(guides, data, first, last)
  // 滚动自管：竖线平移 + 虚拟化窗口跟随（不再由行号模块调度）
  attachGuideScroll(codeBlock, hljs)
}

/** 各代码块的滚动监听控制器（防重复绑定） */
const guideScrollControllers = new WeakMap<HTMLElement, AbortController>()

/** 缩进线滚动自管：监听 .hljs 滚动（rAF 节流），平移 + 重建可视窗口段 */
function attachGuideScroll(codeBlock: HTMLElement, hljs: HTMLElement) {
  if (guideScrollControllers.has(codeBlock)) {
    return
  }
  const ac = new AbortController()
  guideScrollControllers.set(codeBlock, ac)
  const opts = { signal: ac.signal } as AddEventListenerOptions
  let raf = 0
  hljs.addEventListener("scroll", () => {
    if (raf) {
      return
    }
    raf = window.requestAnimationFrame(() => {
      raf = 0
      syncIndentGuides(codeBlock, hljs.scrollTop)
    })
  }, opts)
}

/**
 * 同步缩进线层的滚动偏移 + 虚拟化窗口重建（与行号列同步调用）。
 * 滚动时只重建可视窗口内的段，长代码不重建全部竖线。
 */
export function syncIndentGuides(codeBlock: HTMLElement, scrollTop: number) {
  const guides = getOverlay(codeBlock).querySelector<HTMLElement>(`.${INDENT_GUIDES_CLASS}`)
  if (!guides) {
    return
  }
  setScrollOffset(guides, -scrollTop)
  const data = guideData.get(codeBlock)
  if (!data) {
    return
  }
  const [first, last] = computeWindow(data, scrollTop, codeBlock.clientHeight || 0)
  const key = `${first}-${last}`
  if (guides.dataset.windowKey !== key) {
    guides.dataset.windowKey = key
    renderWindow(guides, data, first, last)
  }
}

/* ---------------- active guide：光标所在缩进级别加深 ---------------- */

const activeControllers = new WeakMap<HTMLElement, AbortController>()

/** 更新 active guide：光标所在行 → 缩进级别 → 加深该级别竖线 */
function setActiveGuide(codeBlock: HTMLElement, lineIdx: number) {
  const data = guideData.get(codeBlock)
  const guides = codeBlock.querySelector<HTMLElement>(`.${INDENT_GUIDES_CLASS}`)
  if (!data || !guides) {
    return
  }
  // 清除旧高亮
  guides.querySelectorAll(`.${ACTIVE_CLASS}`).forEach((el) => el.classList.remove(ACTIVE_CLASS))
  if (lineIdx < 0 || lineIdx >= data.indents.length) {
    return
  }
  const level = Math.round(data.indents[lineIdx] / data.indentWidth)
  if (level <= 0) {
    return
  }
  // 加深该级别的所有竖线（段少，querySelectorAll 开销可忽略）
  guides.querySelectorAll<HTMLElement>(`.${INDENT_GUIDE_CLASS}[data-level="${level}"]`).forEach((el) => {
    el.classList.add(ACTIVE_CLASS)
  })
}

/** 初始化 active guide 高亮：光标移动（点击/键盘/输入）时更新，光标移出块内移除 */
export function initIndentGuidesActive(codeBlock: HTMLElement, hljs: HTMLElement, enabled: boolean) {
  const prev = activeControllers.get(codeBlock)
  if (prev) {
    prev.abort()
    activeControllers.delete(codeBlock)
  }
  // 关闭或没有竖线层 → 清高亮并停止
  if (!enabled || !getOverlay(codeBlock).querySelector(`.${INDENT_GUIDES_CLASS}`)) {
    setActiveGuide(codeBlock, -1)
    return
  }
  const ac = new AbortController()
  activeControllers.set(codeBlock, ac)
  const opts = { signal: ac.signal } as AddEventListenerOptions
  let raf = 0
  let current = -1
  const update = () => {
    const line = caretLine(hljs)
    if (line !== current) {
      current = line
      setActiveGuide(codeBlock, line)
    }
  }
  const schedule = () => {
    if (raf) {
      return
    }
    raf = window.requestAnimationFrame(() => {
      raf = 0
      update()
    })
  }
  // 光标变化来源：点击 / 键盘 / 输入 / 选择变化
  hljs.addEventListener("click", schedule, opts)
  hljs.addEventListener("keyup", schedule, opts)
  hljs.addEventListener("input", schedule, opts)
  document.addEventListener("selectionchange", schedule, opts)
  // 光标离开代码块 → 清高亮（保留监听，回来继续）
  hljs.addEventListener("focusout", () => {
    current = -1
    setActiveGuide(codeBlock, -1)
  }, opts)
  setActiveGuide(codeBlock, caretLine(hljs))
}

/** 移除 active guide 监听与缩进线滚动监听，并清高亮（增强清理时调用） */
export function removeIndentGuidesActive(codeBlock: HTMLElement) {
  const ac = activeControllers.get(codeBlock)
  if (ac) {
    ac.abort()
    activeControllers.delete(codeBlock)
  }
  const sc = guideScrollControllers.get(codeBlock)
  if (sc) {
    sc.abort()
    guideScrollControllers.delete(codeBlock)
  }
  setActiveGuide(codeBlock, -1)
}

registerDecor({
  selfSelector: ".cb-indent-guides",
  enhance: ({
    codeBlock,
    hljs,
    settings,
  }) => {
    if (hljs) {
      initIndentGuidesActive(codeBlock, hljs, settings.activeGuideHighlight)
    }
  },
  cleanup: (codeBlock) => {
    removeIndentGuidesActive(codeBlock)
  },
})

