/**
 * 代码块文本选择保护。
 *
 * 背景：思源对代码块拖选会临时加 `.protyle-wysiwyg--select`（块选中标记）。
 * 时间线实测：移除该标记能让思源从「块选中模式」退回「文本选择模式」——
 * 否则多行文本选择会被阻断。副作用是思源随后会重新加标记（加→移除循环），
 * 视觉闪烁——由 scss 的 `.code-block.cb-beautified.protyle-wysiwyg--select`
 * 背景/阴影覆盖消除。
 *
 * 策略：
 * - mousedown 在 .hljs 上 → 标记「拖选代码文本」
 * - selectionchange 拖选中 → 移除块选中标记（恢复文本选择）
 * - mouseup 后多重 setTimeout 清理残留标记
 */
import {
  registerDecor,
} from "./registry"

/** 当前是否从 .hljs 文本开始拖选 */
let draggingCodeText = false
/** document mouseup 监听引用（供卸载） */
let onDocMouseUp: (() => void) | null = null
/** 已绑定 mousedown 的 .hljs（防重复） */
const boundHljs = new WeakSet<HTMLElement>()
/** selectionchange 监听是否已装（匿名监听用标志位失效） */
let realtimeClearInstalled = false

/** 判断 selection 是否落在给定 .hljs 代码块内 */
export function shouldClearBlockSelect(selection: Selection | null, hljs: HTMLElement | null): boolean {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !hljs) {
    return false
  }
  const inBlock = (node: Node | null): boolean => {
    // 向上遍历父链：node 是 hljs 自身或其内部节点时必经过 hljs
    let current: Node | null = node
    while (current) {
      if (current === hljs) {
        return true
      }
      current = current.parentNode
    }
    return false
  }
  for (let i = 0; i < selection.rangeCount; i += 1) {
    const range = selection.getRangeAt(i)
    if (inBlock(range.startContainer) || inBlock(range.endContainer) || inBlock(range.commonAncestorContainer)) {
      return true
    }
  }
  return false
}

/** 取 selection 首个落在代码块内的 .hljs */
function resolveSelectionHljs(selection: Selection | null): HTMLElement | null {
  if (!selection || selection.rangeCount === 0) {
    return null
  }
  for (let i = 0; i < selection.rangeCount; i += 1) {
    const range = selection.getRangeAt(i)
    for (const node of [range.startContainer, range.endContainer, range.commonAncestorContainer]) {
      const hljs = node.nodeType === Node.ELEMENT_NODE
        ? (node as Element).closest(".hljs") as HTMLElement | null
        : node.parentElement?.closest(".hljs") as HTMLElement | null
      if (hljs) {
        return hljs
      }
    }
  }
  return null
}

/** 清理思源块选中标记（保留原生 selection） */
function clearBlockSelect() {
  const sel = window.getSelection()
  const hljs = resolveSelectionHljs(sel)
  if (!shouldClearBlockSelect(sel, hljs)) {
    return
  }
  document.querySelectorAll<HTMLElement>(".protyle-wysiwyg--select").forEach((el) => {
    el.classList.remove("protyle-wysiwyg--select")
  })
}

/** 拖选期间实时清理：移除标记让思源退回文本选择模式 */
function installRealtimeClear() {
  if (realtimeClearInstalled) {
    return
  }
  realtimeClearInstalled = true
  document.addEventListener("selectionchange", () => {
    if (!realtimeClearInstalled || !draggingCodeText) {
      return
    }
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      return
    }
    const hljs = resolveSelectionHljs(sel)
    if (!hljs || !shouldClearBlockSelect(sel, hljs)) {
      return
    }
    document.querySelectorAll<HTMLElement>(".protyle-wysiwyg--select").forEach((el) => {
      el.classList.remove("protyle-wysiwyg--select")
    })
  })
}

/** mouseup 后多重清理（思源可能在结束后异步重加标记） */
function installDocumentMouseUp() {
  if (onDocMouseUp) {
    return
  }
  onDocMouseUp = () => {
    if (!draggingCodeText) {
      return
    }
    draggingCodeText = false
    setTimeout(clearBlockSelect, 0)
    setTimeout(clearBlockSelect, 30)
    setTimeout(clearBlockSelect, 120)
  }
  document.addEventListener("mouseup", onDocMouseUp)
}

/** 初始化：给 .hljs 绑定 mousedown（标记拖选起点，防重复） */
function initSelectionGuard(hljs: HTMLElement) {
  installDocumentMouseUp()
  installRealtimeClear()
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
  if (realtimeClearInstalled) {
    // selectionchange 是匿名监听无法单独移除，用标志位失效
    realtimeClearInstalled = false
  }
  draggingCodeText = false
}

// 本模块不注入 DOM → selfSelector 用 ""，不纳入 getSelfSelectors()，
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
