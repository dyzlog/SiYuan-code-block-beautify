/**
 * 行号列渲染：为代码块注入行号列，行号左侧带折叠箭头槽位，
 * 折叠指示器（箭头）与折叠态省略行均在此渲染。
 *
 * 对齐策略：逐行测量每行代码的真实顶部位置（Range 定位行首字符 /
 * .hljs-line 元素矩形），行号行绝对定位到对应坐标。
 * 不修改 .hljs 的样式与行高（避免干扰思源 protyle 渲染），
 * 行号间距跟随代码实际行高，任何主题/字体下都对齐。
 */
import type { FoldRegion } from "./fold"
import type { FoldState } from "./folding"
import type { CodeBlockSettings } from "./settings"
import {
  setScrollOffset,
} from "../utils/dom"
import { getOverlay } from "../utils/overlay"
import { countVisibleLines } from "../utils/text-range"
import { findFoldRegions } from "./fold"
import {
  getCodeLines,
  getFoldState,
  makeFoldBtn,
  pruneFoldStates,
  unfoldAll,
} from "./folding"
import {
  renderIndentGuides,
} from "./indent-guides"
import { getCodeBlockLanguage } from "./language"
import {
  computeVirtualWindow,
  fallbackLineHeight,
  measureLineElementTops,
  measureLineTops,
} from "./line-metrics"
import { renderLongCodeSection } from "./longcode"
import { registerRenderer } from "./registry"

const LINENUMBERS_CLASS = "cb-linenumbers"
const LINENUMBERS_INNER_CLASS = "cb-linenumbers__inner"

/** 行号列宽度公式中折叠槽位预留宽度（18px 按钮 + 间距） */
const FOLD_SLOT_WIDTH = "1.6em"

/**
 * 为代码块注入行号列并渲染。
 * 幂等：已存在行号列时直接返回（verify 流程依赖此行为）。
 */
export function renderLineNumbers(codeBlock: HTMLElement, settings: CodeBlockSettings) {
  if (getOverlay(codeBlock).querySelector(`.${LINENUMBERS_CLASS}`)) {
    return
  }
  const hljs = codeBlock.querySelector<HTMLElement>(".hljs")
  if (!hljs) {
    return
  }
  codeBlock.classList.add("cb-with-linenumbers")
  const linesEl = document.createElement("div")
  linesEl.className = LINENUMBERS_CLASS
  linesEl.setAttribute("contenteditable", "false")
  const inner = document.createElement("div")
  inner.className = LINENUMBERS_INNER_CLASS
  linesEl.appendChild(inner)
  getOverlay(codeBlock).appendChild(linesEl)

  // 滚动同步：滚动始终发生在 .hljs（折叠时 .hljs 内部滚动预览）。
  // 行号列/缩进线固定在 .code-block 上，仅平移。
  // 用 rAF 合并高频滚动事件（每帧最多处理一次，读最新 scrollTop）；
  // passive 监听让浏览器并行派发滚动事件（不阻塞主线程）；
  // 平移优先用 translate 独立合成属性（比 transform 免矩阵运算，更流畅）
  // ---- 行号列虚拟化：长代码（文本模式）只渲染可视区行号，滚动按窗口更新 ----
  const VIRTUALIZE_THRESHOLD = 200
  const VIEW_BUFFER = 40 // 窗口上下缓冲行数
  const showNumbers = settings.showLineNumber
  const showFolds = settings.foldEnabled
  let viewData: {
    tops: number[]
    heightAt: (i: number) => number
    total: number
    lineMode: boolean
    folded: boolean
    state: FoldState | undefined
    regionMap: Map<number, FoldRegion>
    ellipsisHeight: number
  } | null = null
  let windowKey = ""

  /** 计算当前可视窗口的行范围（folded / lineMode / 短代码全量渲染） */
  const computeWindow = (): [number, number] => {
    if (!viewData) {
      return [-1, -1]
    }
    const avg = viewData.tops.length > 1
      ? (viewData.tops[viewData.tops.length - 1] - viewData.tops[0]) / Math.max(1, viewData.total - 1)
      : fallbackLineHeight(hljs)
    return computeVirtualWindow({
      total: viewData.total,
      scrollTop: hljs.scrollTop,
      viewH: codeBlock.clientHeight || 0,
      avgGap: avg,
      threshold: VIRTUALIZE_THRESHOLD,
      buffer: VIEW_BUFFER,
      full: viewData.folded || viewData.lineMode,
    })
  }

  /** 构造一个行号行：行号 + 折叠箭头槽位（VS Code 风格：箭头在行号和代码之间） */
  const appendNumRow = (
    row: HTMLElement,
    lineNo: number,
    region: FoldRegion | undefined,
    isFolded: boolean,
  ) => {
    if (showNumbers) {
      const num = document.createElement("span")
      num.className = "cb-linenumber__num"
      num.textContent = String(lineNo + 1)
      row.appendChild(num)
    }
    if (showFolds) {
      const slot = document.createElement("span")
      slot.className = "cb-fold-slot"
      if (region) {
        slot.appendChild(makeFoldBtn(codeBlock, lineNo, isFolded))
      }
      row.appendChild(slot)
    }
  }

  /** 定位行号行到对应代码行（逐行坐标） */
  const placeRow = (row: HTMLElement, lineIdx: number) => {
    row.style.top = `${(viewData?.tops[lineIdx] ?? 0)}px`
    row.style.height = `${(viewData?.heightAt(lineIdx) ?? 0)}px`
  }

  /** 重建当前窗口的行号行（虚拟化核心） */
  const renderLineModeRows = (frag: DocumentFragment, first: number, last: number) => {
    const { regionMap } = viewData!
    const lineEls = getCodeLines(hljs)
    const foldedStarts = new Set<number>()
    lineEls.forEach((el, i) => {
      if (el.classList.contains("cb-folded")) {
        foldedStarts.add(i)
      }
    })
    let lineIdx = 0
    for (let i = 0; i < lineEls.length; i++) {
      if (lineEls[i].classList.contains("cb-fold-hidden")) {
        continue
      }
      if (lineIdx < first || lineIdx > last) {
        lineIdx++
        continue
      }
      const row = document.createElement("div")
      row.className = "cb-linenumber"
      appendNumRow(row, i, regionMap.get(i), foldedStarts.has(i))
      placeRow(row, lineIdx)
      frag.appendChild(row)
      lineIdx++
    }
  }

  /** 文本模式：折叠态（已折叠区域与未折叠区域并存） */
  const renderFoldedRows = (frag: DocumentFragment, state: FoldState) => {
    const {
      tops,
      heightAt,
      regionMap,
      ellipsisHeight,
    } = viewData!
    const foldedAreaByStart = new Map<number, { start: number, end: number }>()
    for (const a of state.areas) {
      foldedAreaByStart.set(a.start, a)
    }
    const items: Array<{
      kind: "line" | "ellipsis"
      origNo?: number
      region?: FoldRegion
      isFolded?: boolean
    }> = []
    for (let orig = 0; orig < state.origTotal; orig++) {
      const area = foldedAreaByStart.get(orig)
      if (area) {
        items.push({
          kind: "line",
          origNo: orig,
          region: regionMap.get(orig),
          isFolded: true,
        })
        items.push({ kind: "ellipsis" })
        orig = area.end
      } else {
        items.push({
          kind: "line",
          origNo: orig,
          region: regionMap.get(orig),
          isFolded: false,
        })
      }
    }
    let lineIdx = 0
    for (const item of items) {
      const row = document.createElement("div")
      row.className = "cb-linenumber"
      if (item.kind === "ellipsis") {
        row.classList.add("cb-linenumber--ellipsis")
        row.textContent = "⋯"
        // 省略行位于前一个可见行底部
        const prevTop = lineIdx > 0 ? tops[lineIdx - 1] : 0
        const prevH = lineIdx > 0 ? heightAt(lineIdx - 1) : ellipsisHeight
        row.style.top = `${prevTop + prevH}px`
        row.style.height = `${ellipsisHeight}px`
      } else {
        appendNumRow(row, item.origNo!, item.region, item.isFolded ?? false)
        placeRow(row, lineIdx)
        lineIdx++
      }
      frag.appendChild(row)
    }
  }

  /** 文本模式：正常态（虚拟化窗口） */
  const renderNormalRows = (frag: DocumentFragment, first: number, last: number) => {
    const { regionMap } = viewData!
    for (let i = first; i <= last; i++) {
      const row = document.createElement("div")
      row.className = "cb-linenumber"
      appendNumRow(row, i, regionMap.get(i), false)
      placeRow(row, i)
      frag.appendChild(row)
    }
  }

  const renderRows = () => {
    if (!viewData) {
      return
    }
    const {
      lineMode,
      folded,
      state,
    } = viewData
    inner.querySelectorAll(`.cb-linenumber`).forEach((el) => el.remove())
    const [first, last] = computeWindow()
    const frag = document.createDocumentFragment()

    if (lineMode) {
      renderLineModeRows(frag, first, last)
    } else if (folded && state) {
      renderFoldedRows(frag, state)
    } else {
      renderNormalRows(frag, first, last)
    }
    inner.appendChild(frag)
  }
  let scrollRaf = 0
  let scrollDirty = false
  const applyScroll = () => {
    const y = -hljs.scrollTop
    setScrollOffset(inner, y)
    // 缩进线滚动自管（indent-guides 内部监听 hljs scroll）
    // 虚拟化：可视窗口变化时重建行号行
    if (viewData) {
      const [f, l] = computeWindow()
      const key = `${f}-${l}`
      if (key !== windowKey) {
        windowKey = key
        renderRows()
      }
    }
  }
  const syncScroll = () => {
    scrollDirty = true
    if (scrollRaf) {
      return
    }
    scrollRaf = window.requestAnimationFrame(() => {
      scrollRaf = 0
      if (scrollDirty) {
        scrollDirty = false
        applyScroll()
      }
    })
  }

  const render = () => {
    const text = hljs.textContent ?? ""
    const lineEls = getCodeLines(hljs)
    const lineMode = lineEls.length > 0

    // 清理失效折叠状态（思源重渲染后省略行被移除）
    pruneFoldStates(codeBlock)
    const state = getFoldState(codeBlock)
    const folded = !!state && state.areas.length > 0

    // 逐行测量每行顶部坐标（折叠态测量当前可见行）
    let tops: number[] = []
    let avgGap = 0
    if (lineMode) {
      tops = measureLineElementTops(hljs, lineEls)
    } else {
      const m = measureLineTops(hljs)
      tops = m.tops
      avgGap = m.avgGap
    }
    if (tops.length === 0) {
      tops = [0]
    }
    // 行号行高度：相邻行间距；最后一行用平均间距回退
    const heightAt = (i: number) => {
      const next = tops[i + 1]
      const cur = tops[i]
      if (next !== undefined && next > cur) {
        return next - cur
      }
      return avgGap || fallbackLineHeight(hljs)
    }
    // 省略行高度：平均行高（折叠占位行）
    const ellipsisHeight = avgGap || fallbackLineHeight(hljs)

    // 字体/字号变量（行号列与省略行使用；不修改 .hljs 的样式）
    const cs = getComputedStyle(hljs)
    codeBlock.style.setProperty("--cb-line-font-size", cs.fontSize)
    codeBlock.style.setProperty("--cb-font-family", cs.fontFamily)
    // 省略行 div 显式设置高度（与占位行一致）
    codeBlock.querySelectorAll<HTMLElement>(".cb-fold-ellipsis").forEach((el) => {
      el.style.height = `${ellipsisHeight}px`
      el.style.lineHeight = `${ellipsisHeight}px`
    })

    // 区域来源：折叠态用折叠前记录的区域（保证未折叠区域箭头仍在），否则实时计算
    const language = getCodeBlockLanguage(codeBlock)
    const regions = showFolds ? (state ? state.regions : findFoldRegions(text, language)) : []
    const regionMap = new Map<number, FoldRegion>()
    for (const r of regions) {
      regionMap.set(r.start, r)
    }

    // 行号列宽度：数字位数 + 折叠按钮槽位宽度（统一预留，保证所有代码块行号同列）。
    // 数字右侧预留 1.2em = 槽位↔数字 gap(6px) + 数字↔分割线 padding(10px)，避免多余空隙。
    // 注意：该变量必须设置在 .code-block 上，因为 .hljs 的 padding-left 也要引用它
    const widthDigits = folded && state
      ? String(state.origTotal).length
      : String(lineMode ? lineEls.length : countVisibleLines(text)).length
    const markerW = showFolds ? FOLD_SLOT_WIDTH : "0em"
    codeBlock.style.setProperty(
      "--cb-linenumber-width",
      showNumbers ? `calc(${widthDigits}ch + 1.2em + ${markerW})` : markerW,
    )

    inner.textContent = ""
    inner.style.height = "0px"
    // 更新虚拟化数据并渲染可视窗口的行号行
    viewData = {
      tops,
      heightAt,
      total: lineMode ? lineEls.length : countVisibleLines(text),
      lineMode,
      folded,
      state,
      regionMap,
      ellipsisHeight,
    }
    renderRows()
    // VS Code 风格：代码缩进竖线（仅文本模式，受设置开关控制）
    if (!lineMode && settings.showIndentGuides) {
      renderIndentGuides(codeBlock, hljs, text, tops, heightAt, settings.rainbowIndent)
    } else {
      getOverlay(codeBlock).querySelector(".cb-indent-guides")?.remove()
    }
    // 长代码折叠 + 顶部主题装饰栏（仅文本模式）——策略在 longcode 模块内自管
    if (!lineMode) {
      renderLongCodeSection(codeBlock, hljs, settings, text, tops, heightAt)
    }
    // 行号列内容总高度（滚动同步时底部内容可显示）
    const lastTop = tops.length > 0 ? tops[tops.length - 1] : 0
    inner.style.height = `${lastTop + heightAt(tops.length - 1)}px`
    syncScroll()
  }
  registerRenderer(codeBlock, render)

  // 编辑联动：输入/粘贴更新行号；进入编辑自动展开折叠
  hljs.addEventListener("input", render)
  hljs.addEventListener("paste", () => window.setTimeout(render, 0))
  hljs.addEventListener("focusin", () => unfoldAll(codeBlock))
  // 滚动同步（passive：浏览器并行派发滚动事件，不阻塞主线程；滚动源是 .hljs）
  hljs.addEventListener("scroll", syncScroll, { passive: true })

  render()
}
