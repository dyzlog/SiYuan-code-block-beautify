/**
 * 代码内折叠：折叠状态管理与折叠/展开操作。
 *
 * 两种模式自动适配思源版本差异：
 * - 行元素模式：`.hljs` 内含 `.hljs-line` 行元素时，通过 class 隐藏行
 * - 文本模式：`.hljs` 为「高亮 span + 换行文本」结构时，用 Range API 按文本偏移
 *   提取区域内容（保留高亮结构），以省略行占位；折叠期间代码块置为只读，
 *   进入编辑自动展开恢复，避免干扰思源的数据同步
 */
import type { FoldRegion } from "./fold"
import {
  getCodeLines,
  getCodeText,
} from "../utils/dom"
import {
  countVisibleLines,
  getLineStarts,
  makeRange,
} from "../utils/text-range"
import { findFoldRegions } from "./fold"
import { getCodeBlockLanguage } from "./language"
import { rerenderBlock } from "./registry"

/** 折叠省略行类名（enhancer 兜底清理 / 折叠功能复用） */
export const ELLIPSIS_CLASS = "cb-fold-ellipsis"

const FOLDED_CLASS = "cb-folded"
const FOLD_HIDDEN_CLASS = "cb-fold-hidden"

/** 文本模式折叠区域状态 */
interface FoldAreaState {
  /** 原始行号（0 基） */
  start: number
  end: number
  /** .hljs 内的省略行占位元素 */
  ellipsis: HTMLElement
  /** 提取出的区域内容（展开时原样恢复） */
  fragment: DocumentFragment
}

export interface FoldState {
  /** 折叠前总行数 */
  origTotal: number
  /** 折叠前检测到的全部区域（含已折叠与未折叠），供多区域折叠与渲染 */
  regions: FoldRegion[]
  /** 已折叠的区域 */
  areas: FoldAreaState[]
}

const foldStates = new WeakMap<HTMLElement, FoldState>()

/** 获取代码块的折叠状态（未折叠过则返回 undefined） */
export function getFoldState(codeBlock: HTMLElement): FoldState | undefined {
  return foldStates.get(codeBlock)
}

/** 折叠 / 展开某个区域（自动选择模式） */
function toggleFold(codeBlock: HTMLElement, startLine: number) {
  const hljs = codeBlock.querySelector<HTMLElement>(".hljs")
  if (!hljs) {
    return
  }
  const language = getCodeBlockLanguage(codeBlock)
  const lineEls = getCodeLines(hljs)
  if (lineEls.length > 0) {
    toggleFoldByClass(hljs, lineEls, startLine, language)
  } else {
    toggleFoldByText(codeBlock, hljs, startLine, language)
  }
  rerenderBlock(codeBlock)
}

/** 折叠按钮（折叠态显示右箭头，否则下箭头），箭头用 CSS 三角形绘制 */
export function makeFoldBtn(codeBlock: HTMLElement, lineNo: number, folded: boolean): HTMLButtonElement {
  const btn = document.createElement("button")
  btn.type = "button"
  btn.className = folded ? "cb-fold-btn cb-fold-btn--folded" : "cb-fold-btn"
  btn.title = folded ? "展开代码块" : "折叠代码块"
  btn.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()
    toggleFold(codeBlock, lineNo)
  })
  return btn
}

/** 进入编辑时展开该块所有折叠，避免影响输入 */
export function unfoldAll(codeBlock: HTMLElement) {
  const hljs = codeBlock.querySelector<HTMLElement>(".hljs")
  if (!hljs) {
    return
  }
  const state = foldStates.get(codeBlock)
  if (state) {
    for (const area of [...state.areas]) {
      unfoldTextArea(codeBlock, hljs, area, state)
    }
  }
  let changed = false
  hljs.querySelectorAll<HTMLElement>(`.${FOLDED_CLASS}, .${FOLD_HIDDEN_CLASS}`).forEach((el) => {
    el.classList.remove(FOLDED_CLASS, FOLD_HIDDEN_CLASS)
    changed = true
  })
  if (state || changed) {
    rerenderBlock(codeBlock)
  }
}

/** 完整清除代码块的折叠状态（展开所有区域 + 清理 class），供卸载/设置变更使用 */
export function clearFoldState(codeBlock: HTMLElement) {
  const hljs = codeBlock.querySelector<HTMLElement>(".hljs")
  const state = foldStates.get(codeBlock)
  if (state) {
    for (const area of state.areas) {
      area.ellipsis.replaceWith(area.fragment)
    }
    foldStates.delete(codeBlock)
  }
  if (hljs) {
    hljs.setAttribute("contenteditable", "true")
    hljs.querySelectorAll<HTMLElement>(`.${FOLDED_CLASS}, .${FOLD_HIDDEN_CLASS}`).forEach((el) => {
      el.classList.remove(FOLDED_CLASS, FOLD_HIDDEN_CLASS)
    })
  }
}

/** 行元素模式：class 隐藏/恢复 */
function toggleFoldByClass(hljs: HTMLElement, lineEls: HTMLElement[], startLine: number, language: string) {
  const region = findFoldRegions(getCodeText(hljs), language).find((r) => r.start === startLine)
  if (!region) {
    return
  }
  const startEl = lineEls[region.start]
  if (startEl.classList.contains(FOLDED_CLASS)) {
    startEl.classList.remove(FOLDED_CLASS)
    for (let i = region.start + 1; i <= region.end; i++) {
      lineEls[i]?.classList.remove(FOLD_HIDDEN_CLASS)
    }
  } else {
    startEl.classList.add(FOLDED_CLASS)
    for (let i = region.start + 1; i <= region.end; i++) {
      lineEls[i]?.classList.add(FOLD_HIDDEN_CLASS)
    }
  }
}

/** 文本模式：Range 提取/恢复 */
function toggleFoldByText(codeBlock: HTMLElement, hljs: HTMLElement, startLine: number, language: string) {
  const state = foldStates.get(codeBlock)
  const existing = state?.areas.find((a) => a.start === startLine)
  if (existing && state) {
    unfoldTextArea(codeBlock, hljs, existing, state)
    return
  }
  const text = getCodeText(hljs)
  // 优先使用折叠前记录的区域（折叠态下文本已变化，不能重新解析）
  const region = state?.regions.find((r) => r.start === startLine)
    ?? findFoldRegions(text, language).find((r) => r.start === startLine)
  if (region) {
    foldTextArea(codeBlock, hljs, region, language)
  }
}

function foldTextArea(codeBlock: HTMLElement, hljs: HTMLElement, region: FoldRegion, language: string) {
  let state = foldStates.get(codeBlock)
  // 目标区域内若已有折叠区域（嵌套折叠），先展开它们再折叠外层，
  // 否则外层 extractContents 会把内层省略行一并提取走，导致内容错乱
  if (state && state.areas.length > 0) {
    const inner = state.areas.filter((a) => (
      a.start >= region.start
      && a.end <= region.end
      && !(a.start === region.start && a.end === region.end)
    ))
    for (const a of inner) {
      unfoldTextArea(codeBlock, hljs, a, state)
    }
    state = foldStates.get(codeBlock)
  }
  // 换算为当前文本行号：前面已折叠的区域会占走行（原始行号 → 当前行号）
  let shift = 0
  if (state) {
    for (const a of state.areas) {
      if (a.end < region.start) {
        shift += a.end - a.start
      }
    }
  }
  const curRegion: FoldRegion = {
    start: region.start - shift,
    end: region.end - shift,
  }
  const text = getCodeText(hljs)
  const starts = getLineStarts(text)
  const startOff = starts[curRegion.start + 1]
  if (startOff === undefined) {
    return
  }
  const endOff = curRegion.end + 1 < starts.length ? starts[curRegion.end + 1] : text.length
  if (startOff >= endOff) {
    return
  }
  const range = makeRange(hljs, startOff, endOff)
  const fragment = range.extractContents()
  const ellipsis = document.createElement("div")
  ellipsis.className = ELLIPSIS_CLASS
  ellipsis.setAttribute("contenteditable", "false")
  ellipsis.dataset.count = String(region.end - region.start)
  ellipsis.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()
    toggleFold(codeBlock, region.start)
  })
  range.insertNode(ellipsis)

  if (!state) {
    // 首次折叠时记录折叠前的完整区域列表，供多区域折叠与渲染
    foldStates.set(codeBlock, {
      origTotal: countVisibleLines(text),
      regions: findFoldRegions(text, language),
      areas: [],
    })
  }
  state = foldStates.get(codeBlock)!
  state.areas.push({
    start: region.start,
    end: region.end,
    ellipsis,
    fragment,
  })
  state.areas.sort((a, b) => a.start - b.start)
  // 折叠期间置为只读，防止思源数据同步读到不完整内容
  hljs.setAttribute("contenteditable", "false")
}

function unfoldTextArea(codeBlock: HTMLElement, hljs: HTMLElement, area: FoldAreaState, state: FoldState) {
  area.ellipsis.replaceWith(area.fragment)
  state.areas = state.areas.filter((a) => a !== area)
  if (state.areas.length === 0) {
    foldStates.delete(codeBlock)
  }
  // 展开后始终恢复可编辑（折叠内容已还原到 DOM，用户可编辑可见部分）
  hljs.setAttribute("contenteditable", "true")
}
