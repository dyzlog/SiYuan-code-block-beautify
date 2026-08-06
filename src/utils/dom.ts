/**
 * 代码块美化插件 - 公共 DOM 能力检测
 */
import { getLineStarts } from "./text-range"

/** 代码块增强标记（dataset.cbEnhanced 的值） */export const ENHANCED_VALUE = "1"

/** 读取代码块 .hljs 的纯文本（空值兜底） */
export function getCodeText(hljs: HTMLElement | null | undefined): string {
  return hljs?.textContent ?? ""
}

/** 遍历根节点下所有文本节点 */
export function forEachTextNode(root: Node, cb: (text: Text) => void) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode() as Text | null
  while (node) {
    cb(node)
    node = walker.nextNode() as Text | null
  }
}

/** 空闲期调度：优先 requestIdleCallback，回退 setTimeout（滚动中不抢主线程） */
export function scheduleIdle(cb: () => void, timeout = 1000) {
  const ric = (window as unknown as {
    requestIdleCallback?: (c: () => void, opts?: { timeout: number }) => void
  }).requestIdleCallback
  if (ric) {
    ric(cb, { timeout })
  } else {
    window.setTimeout(cb, Math.min(timeout, 120))
  }
}

/** 由 selection 定位光标所在行（-1 = 光标不在该根节点内） */
export function caretLine(root: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) {
    return -1
  }
  const node = sel.focusNode ?? sel.anchorNode
  const offset = sel.focusOffset ?? sel.anchorOffset
  if (!node || !root.contains(node)) {
    return -1
  }
  const text = root.textContent ?? ""
  // 节点相对 root 的文本偏移
  let acc = 0
  let abs = 0
  let found = false
  forEachTextNode(root, (n) => {
    if (found) {
      return
    }
    if (n === node) {
      abs = acc + offset
      found = true
    } else {
      acc += n.data.length
    }
  })
  const starts = getLineStarts(text)
  let idx = 0
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] <= abs) {
      idx = i
    } else {
      break
    }
  }
  return idx
}
