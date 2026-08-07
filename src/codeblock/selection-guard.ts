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
/** document mouseup 监听是否已绑定（只绑定一次） */
let installed = false

/** 清理思源块选中标记（若存在），保留原生 selection */
function clearBlockSelect() {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    return
  }
  // 仅当 selection 起点/终点在代码块 .hljs 内才清理（用户确实在选代码文本）
  const range = sel.getRangeAt(0)
  const inCode = (node: Node | null): boolean => {
    return !!node && !!node.parentElement?.closest(".hljs")
  }
  if (!inCode(range.startContainer) && !inCode(range.endContainer)) {
    return
  }
  // 移除思源块选中标记（视觉上恢复「选中文本」而非「选中整个块」）
  document.querySelectorAll<HTMLElement>(".protyle-wysiwyg--select").forEach((el) => {
    el.classList.remove("protyle-wysiwyg--select")
  })
}

/** document 级 mouseup：拖选代码文本后清理块选中（只绑定一次） */
function installDocumentMouseUp() {
  if (installed) {
    return
  }
  installed = true
  document.addEventListener("mouseup", () => {
    if (!draggingCodeText) {
      return
    }
    draggingCodeText = false
    // setTimeout(0) 在事件循环末尾执行，确保思源的块选中逻辑已运行
    setTimeout(clearBlockSelect, 0)
  })
}

/** 初始化：给代码块 .hljs 绑定 mousedown（标记拖选起点） */
function initSelectionGuard(hljs: HTMLElement) {
  installDocumentMouseUp()
  hljs.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button === 0) {
      draggingCodeText = true
    }
  })
}

registerDecor({
  selfSelector: ".hljs",
  enhance: (ctx) => {
    if (ctx.hljs) {
      initSelectionGuard(ctx.hljs)
    }
  },
  cleanup: () => {
    draggingCodeText = false
  },
})
