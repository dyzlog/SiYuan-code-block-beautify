/**
 * 当前行高亮：跟随输入光标（caret）。
 * 光标在代码块内（点击 / 键盘移动 / 输入）→ 高亮光标所在行；
 * 光标移出（失焦 / selection 离开）→ 移除。
 * rAF 节流：高频事件（selectionchange 等）每帧最多处理一次，保证流畅。
 */
import {
  caretLine,
  getCodeText,
} from "../utils/dom"
import { getOverlay } from "../utils/overlay"
import {
  getLineStarts,
  makeRange,
} from "../utils/text-range"
import {
  registerDecor,
} from "./registry"

/** 高亮块元素类名 */
const HIGHLIGHT_CLASS = "cb-current-line"

/** 各代码块的监听控制器（防重复 init 累积事件监听） */
const controllers = new WeakMap<HTMLElement, AbortController>()

/** 高亮指定行（定位高亮块；高度 = 完整行高，与闪烁光标一致） */
function highlightLine(codeBlock: HTMLElement, hljs: HTMLElement, lineIdx: number) {
  const text = getCodeText(hljs)
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
  let el = getOverlay(codeBlock).querySelector<HTMLElement>(`.${HIGHLIGHT_CLASS}`)
  if (!el) {
    el = document.createElement("div")
    el.className = HIGHLIGHT_CLASS
    el.setAttribute("contenteditable", "false")
    getOverlay(codeBlock).insertBefore(el, getOverlay(codeBlock).firstChild)
  }
  el.style.top = `${rect.top - hljsRect.top}px`
  el.style.height = `${height}px`
}

/** 仅移除高亮块（保留监听，光标回来可继续更新） */
function clearHighlight(codeBlock: HTMLElement) {
  getOverlay(codeBlock).querySelector(`.${HIGHLIGHT_CLASS}`)?.remove()
}

/** 移除高亮块并解除监听 */
function removeCurrentLine(codeBlock: HTMLElement) {
  controllers.get(codeBlock)?.abort()
  controllers.delete(codeBlock)
  clearHighlight(codeBlock)
}

/** 初始化当前行高亮：光标在块内 → 高亮光标行；光标消失 → 移除 */
function initCurrentLine(codeBlock: HTMLElement, hljs: HTMLElement, enabled: boolean) {
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
    // 拖选期间（selection 非折叠）跳过 DOM 写：mousedown→focusin→schedule→rAF 执行时
    // 若用户正在拖动选择，写入高亮 div 会干扰思源 selection 建立 → 触发块级选中
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) {
      return
    }
    const line = caretLine(hljs)
    if (line < 0) {
      // 输入光标消失 → 仅移除高亮（保留监听）
      if (currentLine >= 0) {
        currentLine = -1
        clearHighlight(codeBlock)
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
  // 注意：不监听 selectionchange——思源在 selection 更新期间若检测到空 selection
  // 会触发「块级选中」（整个代码块高亮）。移除 selectionchange 可避免我们的高亮
  // 逻辑干扰思源的选中流程；高亮完全由 click/focusin/keydown/input 驱动即可。
  // 光标彻底离开代码块 → 仅移除高亮（保留监听，光标回来继续跟随）
  hljs.addEventListener("focusout", () => {
    dirty = false
    currentLine = -1
    clearHighlight(codeBlock)
  }, opts)
  // 长代码收起后 .hljs 内部滚动：高亮行跟随内容（highlightLine 用实时 rect，
  // getBoundingClientRect 已含 scrollTop，直接重算即可；无高亮时零开销）
  hljs.addEventListener("scroll", () => {
    if (currentLine >= 0) {
      highlightLine(codeBlock, hljs, currentLine)
    }
  }, opts)
}

registerDecor({
  selfSelector: ".cb-current-line",
  enhance: ({
    codeBlock,
    hljs,
    settings,
  }) => {
    if (hljs) {
      initCurrentLine(codeBlock, hljs, settings.currentLineHighlight)
    }
  },
  cleanup: (codeBlock) => {
    removeCurrentLine(codeBlock)
  },
})

