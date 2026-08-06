/**
 * 文本与 Range 工具：按文本偏移定位/提取 DOM 内容。
 * 供当前行高亮、长代码折叠、代码统计等按行操作使用。
 */
import { forEachTextNode } from "./dom"

/** 统计可见行数：忽略末尾换行造成的空行（思源代码块末尾的 `<br>` 会渲染出一个多余空行） */
export function countVisibleLines(text: string): number {
  const trimmed = text.replace(/\n+$/, "")
  return trimmed ? trimmed.split("\n").length : 1
}

/** 每行起始字符偏移（含行尾 \n 归属上一行） */
export function getLineStarts(text: string): number[] {
  const starts = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      starts.push(i + 1)
    }
  }
  return starts
}

/**
 * 节点级行切分已移除（代码内折叠功能已删除）。
 * 以下保留：countVisibleLines / getLineStarts / makeRange（供长代码折叠、
 * 当前行高亮、代码统计等共用）。
 */

/** 定位文本偏移所在的文本节点 */
function locateTextOffset(root: Node, target: number): { node: Text, offset: number } {
  let acc = 0
  let node: Text | null = null
  let offset = 0
  let last: Text | null = null
  forEachTextNode(root, (t) => {
    const len = t.data.length
    if (node === null && acc + len >= target) {
      node = t
      offset = Math.min(target - acc, len)
      return
    }
    acc += len
    last = t
  })
  if (node) {
    return {
      node,
      offset,
    }
  }
  return {
    node: last ?? (root as Text),
    offset: last ? last.data.length : 0,
  }
}

/** 在文本偏移 [startOffset, endOffset) 之间创建 Range */
export function makeRange(root: HTMLElement, startOffset: number, endOffset: number): Range {
  const range = document.createRange()
  const s = locateTextOffset(root, startOffset)
  const e = locateTextOffset(root, endOffset)
  range.setStart(s.node, s.offset)
  range.setEnd(e.node, e.offset)
  return range
}
