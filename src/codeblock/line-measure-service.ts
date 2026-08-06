import { getCodeLines } from "../utils/dom"
import { makeRange } from "../utils/text-range"
/**
 * 行测距服务：专供长代码折叠使用（行号显示已交给思源原生）。
 *
 * 只计算「第 N 行（阈值行）的顶部坐标 + 行高」——这是长代码折叠
 * 收起高度（max-height）的唯一依据。不再为行号显示做全量逐行测量。
 *
 * 测量策略：
 * - 行元素模式（.hljs-line）：直接用元素 offsetTop
 * - 文本模式：用 Range 测量目标行首字符的顶部（只测 1 个目标行）
 */
import { fallbackLineHeight } from "./line-metrics"

export interface LineMeasureResult {
  /** 第 lineNo 行的顶部坐标（相对 .hljs 顶部，px）；失败返回 0 */
  top: number
  /** 行高（px）；用相邻行间距或回退 */
  height: number
}

/** 测量第 lineNo 行的顶部与高度（0 基）。 */
export function measureLineAt(
  hljs: HTMLElement,
  text: string,
  lineNo: number,
): LineMeasureResult {
  // 行元素模式：.hljs-line 元素直接取 offsetTop
  const lineEls = getCodeLines(hljs)
  if (lineEls.length > 0) {
    const el = lineEls[lineNo]
    if (el) {
      const top = el.offsetTop
      const next = lineEls[lineNo + 1]
      const height = next
        ? next.offsetTop - top
        : el.offsetHeight || fallbackLineHeight(hljs)
      return {
        top,
        height,
      }
    }
    return {
      top: 0,
      height: fallbackLineHeight(hljs),
    }
  }
  // 文本模式：Range 测量目标行首字符顶部
  const starts: number[] = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      starts.push(i + 1)
    }
  }
  const start = starts[lineNo]
  if (start === undefined) {
    return {
      top: 0,
      height: fallbackLineHeight(hljs),
    }
  }
  const end = starts[lineNo + 1] ?? text.length
  const hljsRect = hljs.getBoundingClientRect()
  const range = makeRange(hljs, start, end)
  // 安全守卫：Range.getBoundingClientRect 在部分环境（jsdom/无渲染）不存在，
  // 缺失时回退行高估算，避免增强流程抛错
  if (typeof range.getBoundingClientRect !== "function") {
    return {
      top: 0,
      height: fallbackLineHeight(hljs),
    }
  }
  const rect = range.getBoundingClientRect()
  if (rect.height <= 0) {
    return {
      top: 0,
      height: fallbackLineHeight(hljs),
    }
  }
  const top = rect.top - hljsRect.top
  // 行高：测目标行与下一行间距（若下一行存在且同区）
  let height = fallbackLineHeight(hljs)
  if (lineNo + 1 < starts.length) {
    const nextStart = starts[lineNo + 1]
    const nextEnd = starts[lineNo + 2] ?? text.length
    if (nextStart < nextEnd) {
      const nextRange = makeRange(hljs, nextStart, nextEnd)
      if (typeof nextRange.getBoundingClientRect === "function") {
        const nextRect = nextRange.getBoundingClientRect()
        if (nextRect.height > 0 && nextRect.top >= rect.top) {
          height = Math.max(rect.height, nextRect.top - rect.top)
        }
      }
    }
  }
  return {
    top,
    height,
  }
}
