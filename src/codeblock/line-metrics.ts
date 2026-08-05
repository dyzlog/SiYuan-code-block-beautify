/**
 * 行测量纯计算：行号列对齐的根基（历史错位高发区，独立成模块以便测试锁定）。
 *
 * 由 linenumbers.ts 的行测量流程消费：
 * 逐行测量出已知行的 top 坐标后，用这些函数推算缺失行（空行/尾部）的位置。
 */

import { forEachTextNode } from "../utils/dom"
import { countVisibleLines } from "../utils/text-range"

/** 回退行高：computed line-height（测量不可用时兜底） */
export function fallbackLineHeight(hljs: HTMLElement): number {
  const cs = getComputedStyle(hljs)
  const fontSize = Number.parseFloat(cs.fontSize) || 14
  return cs.lineHeight === "normal"
    ? fontSize * 1.6
    : Number.parseFloat(cs.lineHeight) || fontSize * 1.6
}

/** 平均行间距：用相邻有效行的差值推算（含空行） */
export function computeAvgGap(tops: number[], lineCount: number): number {
  const valid: number[] = []
  for (let i = 0; i < lineCount; i++) {
    if (tops[i] !== undefined) {
      valid.push(i)
    }
  }
  let sum = 0
  let count = 0
  for (let k = 1; k < valid.length; k++) {
    const span = valid[k] - valid[k - 1]
    if (span > 0) {
      sum += (tops[valid[k]] - tops[valid[k - 1]]) / span
      count++
    }
  }
  return count ? sum / count : 0
}

/** 填充空行：用平均间距推算，并补齐到文本实际行数（尾部空行等） */
export function fillEmptyRows(tops: number[], lineCount: number, avgGap: number, hljs: HTMLElement) {
  let lastKnownIdx = -1
  let lastKnownTop = 0
  for (let i = 0; i < lineCount; i++) {
    if (tops[i] !== undefined) {
      lastKnownIdx = i
      lastKnownTop = tops[i]
    } else if (avgGap > 0) {
      tops[i] = lastKnownTop + (i - lastKnownIdx) * avgGap
    } else {
      tops[i] = lastKnownTop
    }
  }
  const expected = countVisibleLines(hljs.textContent ?? "")
  while (tops.length < expected) {
    tops.push((tops.length > 0 ? tops[tops.length - 1] : 0) + (avgGap || fallbackLineHeight(hljs)))
  }
}

/**
 * 文本模式：逐行测量文本行顶部的 y 坐标（相对 .hljs 顶部，含 padding/border）。
 * 空行（无字符）用相邻行的平均间距推算。
 */
export function measureLineTops(hljs: HTMLElement): { tops: number[], avgGap: number } {
  const tops: number[] = []
  const hljsRect = hljs.getBoundingClientRect()
  const range = document.createRange()
  let lineNo = 0
  let pendingTop: number | null = null
  forEachTextNode(hljs, (node) => {
    const data = node.data
    for (let offset = 0; offset < data.length; offset++) {
      if (data[offset] === "\n") {
        if (pendingTop !== null) {
          tops[lineNo] = pendingTop
        }
        lineNo++
        pendingTop = null
        continue
      }
      if (pendingTop === null) {
        // 行首字符：测量其顶部
        range.setStart(node, offset)
        range.setEnd(node, offset + 1)
        const rect = range.getBoundingClientRect()
        if (rect.height > 0) {
          pendingTop = rect.top - hljsRect.top
        }
      }
    }
  })
  if (pendingTop !== null) {
    tops[lineNo] = pendingTop
    lineNo++
  }

  const avgGap = computeAvgGap(tops, lineNo)
  fillEmptyRows(tops, lineNo, avgGap, hljs)
  return {
    tops,
    avgGap,
  }
}

/** 行元素模式：测量每个 .hljs-line 元素的顶部（相对 .hljs 顶部） */
export function measureLineElementTops(hljs: HTMLElement, lineEls: HTMLElement[]): number[] {
  const hljsRect = hljs.getBoundingClientRect()
  return lineEls.map((el) => el.getBoundingClientRect().top - hljsRect.top)
}

/** 虚拟化窗口计算参数 */
export interface VirtualWindowOpts {
  /** 总行数 */
  total: number
  /** 滚动偏移（px） */
  scrollTop: number
  /** 可视区高度（px） */
  viewH: number
  /** 平均行高（px） */
  avgGap: number
  /** 触发虚拟化的行数阈值（低于则全量渲染） */
  threshold?: number
  /** 窗口上下缓冲行数 */
  buffer?: number
  /** 强制全量渲染（折叠态 / 行元素模式） */
  full?: boolean
}

/** 计算行号可视窗口 [first, last]（0 基）；短代码/折叠态全量 */
export function computeVirtualWindow(opts: VirtualWindowOpts): [number, number] {
  const {
    total,
    scrollTop,
    viewH,
    avgGap,
    threshold = 200,
    buffer = 40,
    full = false,
  } = opts
  if (full || total <= threshold || avgGap <= 0) {
    return [0, total - 1]
  }
  const first = Math.max(0, Math.floor((scrollTop - buffer * avgGap) / avgGap))
  const last = Math.min(total - 1, Math.ceil((scrollTop + viewH + buffer * avgGap) / avgGap))
  return [first, last]
}
