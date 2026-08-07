/**
 * 代码块美化插件 - 公共 DOM 能力检测
 */

/** 代码块增强标记（dataset.cbEnhanced 的值） */export const ENHANCED_VALUE = "1"

/**
 * 读取代码块 .hljs 的纯文本（空值兜底）。
 */
export function getCodeText(hljs: HTMLElement | null | undefined): string {
  return hljs?.textContent ?? ""
}

/** 获取 .hljs 内的行元素（行元素模式的判定依据，供测距/折叠共用） */
export function getCodeLines(hljs: HTMLElement): HTMLElement[] {
  return Array.from(hljs.querySelectorAll<HTMLElement>(".hljs-line"))
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
