/**
 * 行高回退常量：computed line-height（测量不可用时的兜底）。
 * 行号列已删除，仅长代码折叠（line-measure-service）依赖此回退值。
 */
/** 回退行高：computed line-height（测量不可用时兜底） */
export function fallbackLineHeight(hljs: HTMLElement): number {
  const cs = getComputedStyle(hljs)
  const fontSize = Number.parseFloat(cs.fontSize) || 14
  if (cs.lineHeight && cs.lineHeight !== "normal") {
    const v = Number.parseFloat(cs.lineHeight)
    if (v > 0) {
      return v
    }
  }
  return fontSize * 1.5
}
