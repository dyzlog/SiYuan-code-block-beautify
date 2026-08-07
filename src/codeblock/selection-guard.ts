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

/** document mouseup 监听函数引用（供卸载时移除） */
let onDocMouseUp: (() => void) | null = null
/** 已绑定 mousedown 监听的 .hljs（防重复增强累积监听） */
const boundHljs = new WeakSet<HTMLElement>()

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

function resolveSelectionHljs(selection: Selection | null): HTMLElement | null {
  if (!selection || selection.rangeCount === 0) {
    return null
  }
  for (let i = 0; i < selection.rangeCount; i += 1) {
    const range = selection.getRangeAt(i)
    const nodes = [
      range.startContainer,
      range.endContainer,
      range.commonAncestorContainer,
    ]
    for (const node of nodes) {
      const hljs = getClosestHljs(node)
      if (hljs) {
        return hljs
      }
    }
  }
  return null
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

function debugSelectionState(prefix: string, selection: Selection | null, hljs: HTMLElement | null) {
  if (!DEBUG_SELECTION_GUARD) {
    return
  }
  const selText = selection?.toString() ?? ""
  const rangeCount = selection?.rangeCount ?? 0
  console.groupCollapsed(`[selection-guard] ${prefix}`)
  console.log(`selection text: %c${selText}`, "font-weight: bold; color: navy;")
  console.log("isCollapsed:", selection?.isCollapsed)
  console.log("rangeCount:", rangeCount)
  console.log("hljs:", hljs)
  for (let i = 0; i < rangeCount; i += 1) {
    const range = selection!.getRangeAt(i)
    console.group(`range ${i}`)
    console.log("startContainer:", getNodeDescriptor(range.startContainer), getNodePath(range.startContainer))
    console.log("startOffset:", range.startOffset)
    console.log("endContainer:", getNodeDescriptor(range.endContainer), getNodePath(range.endContainer))
    console.log("endOffset:", range.endOffset)
    console.log("commonAncestor:", getNodeDescriptor(range.commonAncestorContainer), getNodePath(range.commonAncestorContainer))
    console.log("startInCode:", isNodeInCodeBlock(range.startContainer, hljs))
    console.log("endInCode:", isNodeInCodeBlock(range.endContainer, hljs))
    console.log("ancestorInCode:", isNodeInCodeBlock(range.commonAncestorContainer, hljs))
    console.groupEnd()
  }
  const blockSelectEls = document.querySelectorAll<HTMLElement>(".protyle-wysiwyg--select")
  console.log("block-select elements:", blockSelectEls.length, blockSelectEls)
  console.groupEnd()
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

/** 清理思源块选中标记（若存在），保留原生 selection */
function clearBlockSelect() {
  const sel = window.getSelection()
  const hljs = resolveSelectionHljs(sel)
  debugSelectionState("clearBlockSelect start", sel, hljs)
  if (!shouldClearBlockSelect(sel, hljs)) {
    debugSelectionState("clearBlockSelect skipped", sel, hljs)
    return
  }
  // 移除拖选覆盖 class（恢复思源原生块选中能力）
  document.querySelectorAll<HTMLElement>(".cb-drag-selecting").forEach((el) => {
    el.classList.remove("cb-drag-selecting")
  })
  // 移除思源块选中标记（视觉上恢复「选中文本」而非「选中整个块」）
  document.querySelectorAll<HTMLElement>(".protyle-wysiwyg--select").forEach((el) => {
    el.classList.remove("protyle-wysiwyg--select")
  })
  debugSelectionState("clearBlockSelect after clear", sel, hljs)
}

/**
 * 拖选期间处理：
 * 1. 给代码块加 .cb-drag-selecting（CSS 覆盖块选中视觉，避免闪烁——不加时
 *    思源同帧又加标记，移除+重加=闪烁）
 * 2. 移除思源块选中标记
 */
let realtimeClearInstalled = false

function installRealtimeClear() {
  if (realtimeClearInstalled) {
    return
  }
  realtimeClearInstalled = true
  document.addEventListener("selectionchange", () => {
    if (!realtimeClearInstalled) {
      return
    }
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      return
    }
    // 选区必须落在代码块内（否则不动思源的其它块选中）。
    // 不依赖 draggingCodeText：用户可能从代码块上方段落拖入（思源框选逻辑
    // 会给代码块临时加 protyle-wysiwyg--select 闪烁）——只要选区在代码块内
    // 且有内容，就加覆盖 class + 清标记。
    const hljs = resolveSelectionHljs(sel)
    if (!hljs || !shouldClearBlockSelect(sel, hljs)) {
      return
    }
    // 给代码块加拖选覆盖 class（CSS 盖掉块选中视觉，避免闪烁），再移除标记
    const codeBlock = hljs.closest<HTMLElement>(".code-block")
    if (codeBlock) {
      codeBlock.classList.add("cb-drag-selecting")
    }
    // 检测到块选中标记就立即移除（思源拖选中持续添加）
    const marked = document.querySelectorAll<HTMLElement>(".protyle-wysiwyg--select")
    if (marked.length > 0) {
      marked.forEach((el) => el.classList.remove("protyle-wysiwyg--select"))
      if (DEBUG_SELECTION_GUARD) {
        console.log("[selection-guard] realtime clear", marked.length, "block-select marks")
      }
    }
  })
}

/** 安装 document 级 mouseup（只绑定一次；插件卸载时通过 destroySelectionGuard 移除） */
function installDocumentMouseUp() {
  if (onDocMouseUp) {
    return
  }
  onDocMouseUp = () => {
    if (DEBUG_SELECTION_GUARD) {
      console.log("[selection-guard] document mouseup, schedule clearBlockSelect")
    }
    // 多重清理：思源可能在 mouseup 后异步重新加 protyle-wysiwyg--select，
    // 日志显示 blockSelectCount=2 在 mouseup 后仍存在——多时间点各清一次。
    // 不依赖 draggingCodeText（从块外拖入时为 false，但同样需要清理）。
    setTimeout(clearBlockSelect, 0)
    setTimeout(clearBlockSelect, 30)
    setTimeout(clearBlockSelect, 120)
  }
  document.addEventListener("mouseup", onDocMouseUp)
}

/** 初始化：给代码块 .hljs 绑定 mousedown（标记拖选起点，防重复） */
function initSelectionGuard(hljs: HTMLElement) {
  installDocumentMouseUp()
  installRealtimeClear()
  if (boundHljs.has(hljs)) {
    return
  }
  boundHljs.add(hljs)
  hljs.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button === 0 && DEBUG_SELECTION_GUARD) {
      console.log("[selection-guard] mousedown on .hljs", {
        target: e.target,
        button: e.button,
        hljs,
        path: getNodePath(e.target as Node),
      })
    }
  })
}

/** 卸载：移除 document 监听、重置状态 */
function destroySelectionGuard() {
  if (onDocMouseUp) {
    document.removeEventListener("mouseup", onDocMouseUp)
    onDocMouseUp = null
  }
  if (realtimeClearInstalled) {
    // 注意：selectionchange 是匿名函数，无法单独移除。
    // 用标志位让回调失效（插件卸载后不再清理，避免影响思源原生块选中）
    realtimeClearInstalled = false
  }
}

// 本模块不注入 DOM（只挂事件监听）→ selfSelector 用 ""，不纳入 getSelfSelectors()，
// 避免思源 MO 把「用户编辑代码（.hljs 内部变化）」误认为插件自身注入而跳过扫描
registerDecor({
  selfSelector: "",
  enhance: (ctx) => {
    if (ctx.hljs) {
      initSelectionGuard(ctx.hljs)
    }
  },
  cleanup: () => {
    destroySelectionGuard()
  },
})
