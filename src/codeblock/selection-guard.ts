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

/** 当前是否从 .hljs 文本开始拖选 */
let draggingCodeText = false
/** document mouseup 监听函数引用（供卸载时移除） */
let onDocMouseUp: (() => void) | null = null
/** 已绑定 mousedown 监听的 .hljs（防重复增强累积监听） */
const boundHljs = new WeakSet<HTMLElement>()

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
  const hljs = document.querySelector<HTMLElement>(".hljs")
  if (!shouldClearBlockSelect(sel, hljs)) {
    return
  }
  // 移除思源块选中标记（视觉上恢复「选中文本」而非「选中整个块」）
  document.querySelectorAll<HTMLElement>(".protyle-wysiwyg--select").forEach((el) => {
    el.classList.remove("protyle-wysiwyg--select")
  })
}

/** 安装 document 级 mouseup（只绑定一次；插件卸载时通过 destroySelectionGuard 移除） */
function installDocumentMouseUp() {
  if (onDocMouseUp) {
    return
  }
  onDocMouseUp = () => {
    if (!draggingCodeText) {
      return
    }
    draggingCodeText = false
    // setTimeout(0) 在事件循环末尾执行，确保思源的块选中逻辑已运行
    setTimeout(clearBlockSelect, 0)
  }
  document.addEventListener("mouseup", onDocMouseUp)
}

/** 初始化：给代码块 .hljs 绑定 mousedown（标记拖选起点，防重复） */
function initSelectionGuard(hljs: HTMLElement) {
  installDocumentMouseUp()
  if (boundHljs.has(hljs)) {
    return
  }
  boundHljs.add(hljs)
  hljs.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button === 0) {
      draggingCodeText = true
    }
  })
}

/** 卸载：移除 document 监听、重置状态 */
function destroySelectionGuard() {
  if (onDocMouseUp) {
    document.removeEventListener("mouseup", onDocMouseUp)
    onDocMouseUp = null
  }
  draggingCodeText = false
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
