/**
 * 代码块文本选择原生保护。
 *
 * 问题：插件装饰（overlay 覆盖层 / CSS）干扰思源对代码块拖选的判断，
 * 思源在 selection 异常时给代码块加 `.protyle-wysiwyg--select`（块级选中，
 * 整个代码块高亮），破坏原生文本选择（不等价于 .txt 记事本的选择行为）。
 *
 * 方案：监听 .hljs 内的拖选。用户从代码文本开始拖动选择时：
 * 1. 记录「正在拖选代码文本」
 * 2. mouseup 后（思源处理完成），若 selection 非折叠（确实选中了文本）
 *    → 移除代码块上的 `.protyle-wysiwyg--select` 块选中标记
 *    → 保持浏览器原生 selection 不变（等价记事本：任意字符/行精确选择）
 *
 * 仅处理「从代码文本拖选」的场景——不干预思源的其它选中（shift 多选/点击块标等）。
 */
import {
  registerDecor,
} from "./registry"

const DEBUG_MOUSE_LOG = Boolean((window as any).__CB_MOUSE_DEBUG)
const DEBUG_SELECTION_GUARD = Boolean((window as any).__CB_SELECTION_GUARD_DEBUG || DEBUG_MOUSE_LOG)

interface SelectionGuardDebugEntry {
  timestamp: number
  type: string
  target?: string
  targetPath?: string
  inHljs?: boolean
  button?: number
  buttons?: number
  clientX?: number
  clientY?: number
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  metaKey?: boolean
  selectionText?: string
  selectionCollapsed?: boolean
  rangeCount?: number
  blockSelectCount?: number
  startPath?: string
  endPath?: string
  startInCode?: boolean
  endInCode?: boolean
  hasHljsInSelection?: boolean
  comment?: string
}

const debugLog: SelectionGuardDebugEntry[] = []
const pathLog: string[] = []
let debugDiagnosticsInstalled = false
let lastMouseMoveLog = 0

let debugMouseDownHandler: ((event: MouseEvent) => void) | null = null
let debugMouseMoveHandler: ((event: MouseEvent) => void) | null = null
let debugMouseUpHandler: ((event: MouseEvent) => void) | null = null
let debugClickHandler: ((event: MouseEvent) => void) | null = null
let debugDblClickHandler: ((event: MouseEvent) => void) | null = null
let debugAuxClickHandler: ((event: MouseEvent) => void) | null = null
let debugContextMenuHandler: ((event: MouseEvent) => void) | null = null
let debugSelectionChangeHandler: (() => void) | null = null

function getEventTargetNode(target: EventTarget | null): Node | null {
  return target instanceof Node ? target : null
}

function getClosestHljs(node: Node | null): HTMLElement | null {
  if (!node) {
    return null
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    return (node as Element).closest(".hljs") as HTMLElement | null
  }
  return node.parentElement?.closest(".hljs") as HTMLElement | null
}

function getRangeMeta(range: Range, hljs: HTMLElement | null) {
  const startPath = getNodePath(range.startContainer)
  const endPath = getNodePath(range.endContainer)
  return {
    startPath,
    endPath,
    startInCode: isNodeInCodeBlock(range.startContainer, hljs),
    endInCode: isNodeInCodeBlock(range.endContainer, hljs),
    commonAncestorInCode: isNodeInCodeBlock(range.commonAncestorContainer, hljs),
  }
}

function getSelectionMeta(selection: Selection | null, hljs: HTMLElement | null) {
  const rangeMeta = selection && selection.rangeCount > 0
    ? getRangeMeta(selection.getRangeAt(0), hljs)
    : null
  return {
    selectionText: selection?.toString() ?? "",
    selectionCollapsed: selection?.isCollapsed,
    rangeCount: selection?.rangeCount,
    blockSelectCount: document.querySelectorAll<HTMLElement>(".protyle-wysiwyg--select").length,
    startPath: rangeMeta?.startPath,
    endPath: rangeMeta?.endPath,
    startInCode: rangeMeta?.startInCode,
    endInCode: rangeMeta?.endInCode,
    hasHljsInSelection: Boolean(selection && hljs && shouldClearBlockSelect(selection, hljs)),
  }
}

function pushDebugLog(entry: SelectionGuardDebugEntry) {
  debugLog.push(entry)
  if (debugLog.length > 200) {
    debugLog.shift()
  }
}

function pushPathLog(entry: string) {
  pathLog.push(entry)
  if (pathLog.length > 200) {
    pathLog.shift()
  }
}

function debugDetectorLog(entry: SelectionGuardDebugEntry) {
  pushDebugLog(entry)
  if (debugDiagnosticsInstalled || DEBUG_SELECTION_GUARD) {
    const summaryParts: string[] = [
      entry.type,
      entry.startPath ? `start=${entry.startPath}` : undefined,
      entry.endPath ? `end=${entry.endPath}` : undefined,
      entry.hasHljsInSelection ? "codeBlockSelection=true" : "codeBlockSelection=false",
      entry.blockSelectCount !== undefined ? `blockSelectCount=${entry.blockSelectCount}` : undefined,
      entry.comment,
    ].filter(Boolean) as string[]
    console.log(`[selection-guard] ${summaryParts.join(" / ")}`)
  }
}

function installSelectionDiagnostics() {
  if (debugDiagnosticsInstalled) {
    return
  }
  debugDiagnosticsInstalled = true

  const logMouseEvent = (type: string, event: MouseEvent, comment?: string) => {
    const targetNode = getEventTargetNode(event.target)
    const hljs = getClosestHljs(targetNode)
    const selection = window.getSelection()
    const entry: SelectionGuardDebugEntry = {
      timestamp: Date.now(),
      type,
      target: targetNode ? getNodeDescriptor(targetNode) : undefined,
      targetPath: targetNode ? getNodePath(targetNode) : undefined,
      inHljs: Boolean(hljs),
      button: event.button,
      buttons: event.buttons,
      clientX: event.clientX,
      clientY: event.clientY,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      ...getSelectionMeta(selection, hljs),
      comment,
    }
    debugDetectorLog(entry)
    pushPathLog(
      `[${new Date(entry.timestamp).toISOString()}] ${type}`
      + ` target=${entry.targetPath ?? "unknown"}`
      + ` start=${entry.startPath ?? "-"}`
      + ` end=${entry.endPath ?? "-"}`
      + ` codeBlockSelection=${entry.hasHljsInSelection ? "true" : "false"}`
      + ` blockSelectCount=${entry.blockSelectCount ?? 0}${
        comment ? ` comment=${comment}` : ""}`,
    )
  }

  const logSelectionEvent = () => {
    const selection = window.getSelection()
    const targetNode = getEventTargetNode(selection?.focusNode ?? null)
    const hljs = getClosestHljs(targetNode)
    const entry: SelectionGuardDebugEntry = {
      timestamp: Date.now(),
      type: "selectionchange",
      target: targetNode ? getNodeDescriptor(targetNode) : undefined,
      targetPath: targetNode ? getNodePath(targetNode) : undefined,
      inHljs: Boolean(hljs),
      ...getSelectionMeta(selection, hljs),
    }
    debugDetectorLog(entry)
    pushPathLog(
      `[${new Date(entry.timestamp).toISOString()}] selectionchange`
      + ` target=${entry.targetPath ?? "unknown"}`
      + ` start=${entry.startPath ?? "-"}`
      + ` end=${entry.endPath ?? "-"}`
      + ` codeBlockSelection=${entry.hasHljsInSelection ? "true" : "false"}`
      + ` blockSelectCount=${entry.blockSelectCount ?? 0}`,
    )
  }

  debugMouseDownHandler = (event: MouseEvent) => {
    logMouseEvent("mousedown", event)
  }
  debugMouseMoveHandler = (event: MouseEvent) => {
    const now = Date.now()
    if (now - lastMouseMoveLog < 200) {
      return
    }
    lastMouseMoveLog = now
    logMouseEvent("mousemove", event)
  }
  debugMouseUpHandler = (event: MouseEvent) => {
    logMouseEvent("mouseup", event, "end of drag/selection")
    logSelectionEvent()
  }
  debugClickHandler = (event: MouseEvent) => {
    logMouseEvent("click", event, "mouse click")
  }
  debugDblClickHandler = (event: MouseEvent) => {
    logMouseEvent("dblclick", event, "double click")
  }
  debugAuxClickHandler = (event: MouseEvent) => {
    logMouseEvent("auxclick", event, "auxiliary click")
  }
  debugContextMenuHandler = (event: MouseEvent) => {
    logMouseEvent("contextmenu", event, "context menu")
  }
  debugSelectionChangeHandler = () => logSelectionEvent()

  document.addEventListener("mousedown", debugMouseDownHandler, true)
  document.addEventListener("mousemove", debugMouseMoveHandler, true)
  document.addEventListener("mouseup", debugMouseUpHandler, true)
  document.addEventListener("click", debugClickHandler, true)
  document.addEventListener("dblclick", debugDblClickHandler, true)
  document.addEventListener("auxclick", debugAuxClickHandler, true)
  document.addEventListener("contextmenu", debugContextMenuHandler, true)
  document.addEventListener("selectionchange", debugSelectionChangeHandler)
}

function destroySelectionDiagnostics() {
  if (!debugDiagnosticsInstalled) {
    return
  }
  debugDiagnosticsInstalled = false
  if (debugMouseDownHandler) {
    document.removeEventListener("mousedown", debugMouseDownHandler, true)
    debugMouseDownHandler = null
  }
  if (debugMouseMoveHandler) {
    document.removeEventListener("mousemove", debugMouseMoveHandler, true)
    debugMouseMoveHandler = null
  }
  if (debugMouseUpHandler) {
    document.removeEventListener("mouseup", debugMouseUpHandler, true)
    debugMouseUpHandler = null
  }
  if (debugClickHandler) {
    document.removeEventListener("click", debugClickHandler, true)
    debugClickHandler = null
  }
  if (debugDblClickHandler) {
    document.removeEventListener("dblclick", debugDblClickHandler, true)
    debugDblClickHandler = null
  }
  if (debugAuxClickHandler) {
    document.removeEventListener("auxclick", debugAuxClickHandler, true)
    debugAuxClickHandler = null
  }
  if (debugContextMenuHandler) {
    document.removeEventListener("contextmenu", debugContextMenuHandler, true)
    debugContextMenuHandler = null
  }
  if (debugSelectionChangeHandler) {
    document.removeEventListener("selectionchange", debugSelectionChangeHandler)
    debugSelectionChangeHandler = null
  }
}

;(window as any).__CB_SELECTION_GUARD_DETECTOR = {
  enable: installSelectionDiagnostics,
  disable: destroySelectionDiagnostics,
  reset: () => {
    debugLog.length = 0
    pathLog.length = 0
  },
  getLog: () => [...debugLog],
  getPathLog: () => [...pathLog],
  dump: () => {
    console.groupCollapsed("[selection-guard] detector dump")
    console.table(debugLog)
    console.groupEnd()
  },
  dumpPathLog: () => {
    console.groupCollapsed("[selection-guard] path log dump")
    console.table(pathLog)
    console.groupEnd()
  },
}

if (DEBUG_SELECTION_GUARD) {
  installSelectionDiagnostics()
}

function getNodeDescriptor(node: Node | null): string {
  if (!node) {
    return "null"
  }
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim() ?? ""
    return `#text(${JSON.stringify(text.slice(0, 40))})`
  }
  const el = node as Element
  const classes = el.classList.length ? ` class="${Array.from(el.classList).join(" ")}"` : ""
  const id = el.id ? ` id="${el.id}"` : ""
  return `<${el.tagName.toLowerCase()}${id}${classes}>`
}

function getNodePath(node: Node | null, limit = 8): string {
  if (!node) {
    return "null"
  }
  const parts: string[] = []
  let current: Node | null = node
  let depth = 0
  while (current && depth < limit) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const el = current as Element
      const cls = el.className ? `.${el.className.toString().split(/\s+/).filter(Boolean).join(".")}` : ""
      parts.push(`${el.tagName.toLowerCase()}${cls}`)
    } else if (current.nodeType === Node.TEXT_NODE) {
      parts.push("#text")
    } else {
      parts.push(`#${current.nodeName}`)
    }
    current = current.parentNode
    depth += 1
  }
  return parts.join(" > ")
}

function isNodeInCodeBlock(node: Node | null, hljs: HTMLElement | null): boolean {
  if (!node || !hljs) {
    return false
  }
  let current: Node | null = node
  while (current) {
    if (current === hljs) {
      return true
    }
    if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current as Element
      if (element === hljs || element.closest(".hljs") === hljs) {
        return true
      }
    }
    current = current.parentNode
  }
  return false
}

export function shouldClearBlockSelect(selection: Selection | null, hljs: HTMLElement | null): boolean {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !hljs) {
    return false
  }
  for (let i = 0; i < selection.rangeCount; i += 1) {
    const range = selection.getRangeAt(i)
    if (
      isNodeInCodeBlock(range.startContainer, hljs)
      || isNodeInCodeBlock(range.endContainer, hljs)
      || isNodeInCodeBlock(range.commonAncestorContainer, hljs)
    ) {
      return true
    }
  }
  return false
}

/**
 * 选择保护——已降级为「纯 CSS 视觉覆盖」模式：
 *
 * 历史：尝试过 JS 干预（拖选期间/结束时移除 .protyle-wysiwyg--select 标记），
 * 实测都会破坏思源的原生多行文本选择（选中失败/选中被取消）。
 * 结论：protyle-wysiwyg--select 是思源拖选代码文本的正常内部标记，不能动。
 *
 * 当前方案：零 JS 干预。拖选时的「块选中高亮闪烁」由 scss 里的
 * `.code-block.cb-beautified.protyle-wysiwyg--select` 规则做视觉覆盖
 * （box-shadow/outline/filter/::after 置空），思源内部逻辑完全不受影响。
 */

// 本模块不注入 DOM 也不挂事件监听 → selfSelector 用 ""，不纳入 getSelfSelectors()，
// 避免思源 MO 把「用户编辑代码（.hljs 内部变化）」误认为插件自身注入而跳过扫描
registerDecor({
  selfSelector: "",
  enhance: () => {
    // 空实现：选择保护已降级为纯 CSS（见 codeblock.scss 的
    // .code-block.cb-beautified.protyle-wysiwyg--select 覆盖规则）
  },
  cleanup: () => {
    // 无 JS 监听需要清理
  },
})
