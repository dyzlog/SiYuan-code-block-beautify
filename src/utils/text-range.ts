/**
 * 文本与 Range 工具：按文本偏移定位/提取 DOM 内容。
 * 用于文本模式折叠（.hljs 为「高亮 span + 换行文本」结构时按行提取）。
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
 * 节点级行切分：把 .hljs 的子节点按「\n 文本节点」分成行节点组。
 *
 * 思源代码块 DOM 是「高亮 span + 换行文本节点」结构，行分隔符是 \n 文本节点
 * （hljs 输出中通常是独立文本节点）。折叠按节点操作而非文本偏移——
 * 折叠多少次都不会累积偏移误差。
 *
 * 简化：不切分文本节点（splitText 有 DOM 副作用），文本节点按「是否含 \n」
 * 分配到行；含 \n 的文本节点归属当前行并开启新行（\n 后内容计入新行，
 * 但节点本身只归一行——省略行提取时用 Range 按边界，视觉等价）。
 *
 * @returns 每行一个节点数组（含行尾 \n 节点；末尾行可能无 \n）
 */
export function splitLineNodeGroups(root: Node): Node[][] {
  const rows: Node[][] = [[]]
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let node = walker.nextNode()
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      // 元素节点（span 高亮/省略行 div）归入当前行（省略行前后 \n 负责开行）
      rows[rows.length - 1].push(node)
      node = walker.nextNode()
      continue
    }
    const text = (node as Text).data
    rows[rows.length - 1].push(node)
    if (text.includes("\n")) {
      // \n 文本节点开启新行（hljs 通常一个 \n 一个节点）
      rows.push([])
    }
    node = walker.nextNode()
  }
  // 末尾空行（最后一个 \n 后无内容）移除
  if (rows.length > 1 && rows[rows.length - 1].length === 0) {
    rows.pop()
  }
  return rows
}

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
