/**
 * 当前行高亮：跟随输入光标（caret）。
 * 光标在代码块内（点击 / 键盘移动 / 输入）→ 高亮光标所在行；
 * 光标移出（失焦 / selection 离开）→ 移除。
 * rAF 节流：高频事件（selectionchange 等）每帧最多处理一次，保证流畅。
 */
import { forEachTextNode } from "../utils/dom"
import {
  getLineStarts,
  makeRange,
} from "../utils/text-range"

/** 高亮块元素类名 */
const HIGHLIGHT_CLASS = "cb-current-line"

/** 各代码块的监听控制器（防重复 init 累积事件监听） */
const controllers = new WeakMap<HTMLElement, AbortController>()

/** 计算节点相对根节点的文本偏移 */
function nodeOffset(root: Node, target: Node, targetOffset: number): number {
  let acc = 0
  let result = 0
  let found = false
  forEachTextNode(root, (node) => {
    if (found) {
      return
    }
    if (node === target) {
      result = acc + targetOffset
      found = true
    } else {
      acc += node.data.length
    }
  })
  return found ? result : acc
}

/** 由 selection 定位光标所在行（-1 = 光标不在该代码块内） */
function caretLine(hljs: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) {
    return -1
  }
  const node = sel.focusNode ?? sel.anchorNode
  const offset = sel.focusOffset ?? sel.anchorOffset
  if (!node || !hljs.contains(node)) {
    return -1
  }
  const text = hljs.textContent ?? ""
  const abs = nodeOffset(hljs, node, offset)
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

/** 高亮指定行（定位高亮块；高度 = 完整行高，与闪烁光标一致） */
function highlightLine(codeBlock: HTMLElement, hljs: HTMLElement, lineIdx: number) {
  const text = hljs.textContent ?? ""
  const starts = getLineStarts(text)
  if (lineIdx < 0 || lineIdx >= starts.length) {
    return
  }
  const start = starts[lineIdx]
  // end 取下一行起始（含换行），Range 覆盖整行
  const end = lineIdx + 1 < starts.length ? starts[lineIdx + 1] : text.length
  const range = makeRange(hljs, start, end)
  const rect = range.getBoundingClientRect()
  if (rect.height <= 0) {
    return
  }
  // 高度取完整行间距（本行顶部 → 下一行起始），与闪烁光标所在行盒一致
  let height = rect.height
  if (lineIdx + 1 < starts.length) {
    const nextEnd = lineIdx + 2 < starts.length ? starts[lineIdx + 2] : text.length
    const nextRange = makeRange(hljs, starts[lineIdx + 1], nextEnd)
    const nextRect = nextRange.getBoundingClientRect()
    if (nextRect.height > 0 && nextRect.top >= rect.top) {
      height = Math.max(height, nextRect.top - rect.top)
    }
  }
  const hljsRect = hljs.getBoundingClientRect()
  let el = codeBlock.querySelector<HTMLElement>(`.${HIGHLIGHT_CLASS}`)
  if (!el) {
    el = document.createElement("div")
    el.className = HIGHLIGHT_CLASS
    el.setAttribute("contenteditable", "false")
    codeBlock.insertBefore(el, codeBlock.firstChild)
  }
  el.style.top = `${rect.top - hljsRect.top}px`
  el.style.height = `${height}px`
}

/** 移除高亮块并解除监听 */
export function removeCurrentLine(codeBlock: HTMLElement) {
  controllers.get(codeBlock)?.abort()
  controllers.delete(codeBlock)
  codeBlock.querySelector(`.${HIGHLIGHT_CLASS}`)?.remove()
}

/** 初始化当前行高亮：光标在块内 → 高亮光标行；光标消失 → 移除 */
export function initCurrentLine(codeBlock: HTMLElement, hljs: HTMLElement, enabled: boolean) {
  if (!enabled) {
    removeCurrentLine(codeBlock)
    return
  }
  // 先解除旧监听（设置开关/重扫可能重复初始化）
  controllers.get(codeBlock)?.abort()
  const ac = new AbortController()
  controllers.set(codeBlock, ac)
  const opts = { signal: ac.signal }
  let raf = 0
  let dirty = false
  let currentLine = -1

  const apply = () => {
    raf = 0
    if (!dirty) {
      return
    }
    dirty = false
    const line = caretLine(hljs)
    if (line < 0) {
      // 输入光标消失 → 移除高亮
      if (currentLine >= 0) {
        currentLine = -1
        removeCurrentLine(codeBlock)
      }
      return
    }
    if (line !== currentLine) {
      currentLine = line
      highlightLine(codeBlock, hljs, line)
    }
  }

  const schedule = () => {
    dirty = true
    if (raf) {
      return
    }
    raf = window.requestAnimationFrame(apply)
  }

  // 输入光标相关事件（rAF 节流，每帧最多处理一次）
  // 仅跟随光标（caret）：focusin / 键盘移动 / 输入 / 点击设置光标
  hljs.addEventListener("focusin", schedule, opts)
  hljs.addEventListener("keydown", schedule, opts)
  hljs.addEventListener("keyup", schedule, opts)
  hljs.addEventListener("click", schedule, opts)
  hljs.addEventListener("input", schedule, opts)
  // selectionchange：全局选区变化驱动；但鼠标在代码块内悬停移动时思源可能触发
  // selection 抖动，这里在鼠标移动后的短窗口内抑制，避免「鼠标移动带动高亮」
  let lastMouseMoveAt = 0
  hljs.addEventListener("mousemove", () => {
    lastMouseMoveAt = Date.now()
  }, opts)
  document.addEventListener("selectionchange", () => {
    if (Date.now() - lastMouseMoveAt < 200) {
      return
    }
    schedule()
  }, opts)
  // 光标彻底离开代码块 → 立即移除
  hljs.addEventListener("focusout", () => {
    dirty = false
    currentLine = -1
    removeCurrentLine(codeBlock)
  }, opts)
}
