/**
 * 保存防护（确定性兜底）：防止折叠省略行被思源序列化进文档。
 *
 * 背景：折叠省略行（.cb-fold-ellipsis）位于 .hljs 内，若思源在折叠态
 * 读取块 outerHTML（如非编辑路径的批量事务），省略行会被写入文档。
 * 常规编辑路径已由「折叠时 contenteditable=false + focusin 自动展开」隔离，
 * 本模块补上「思源事务处理信号」的兜底。
 *
 * 机制：思源每次对块发起事务更新都会设置 data-editing 属性
 * （transaction.ts 多处 setAttribute(ATTRIBUTE_EDITING)）。
 * 观察到该属性出现 → 立即展开该块折叠，保证下一次事务读到干净 DOM。
 * 展开是幂等的，无折叠时零开销。
 *
 * 观察器复用：不自建 document 级 MutationObserver（与 enhancer 合并为一个），
 * 导出 handleEditingMutation 供 enhancer 的共享 observer 回调调用。
 */
import { unfoldAll } from "./folding"

/**
 * 处理 data-editing 属性变化（由 enhancer 的共享 MutationObserver 回调调用）。
 * 思源对任何代码块发起事务更新时设置该属性 → 触发展开。
 */
export function handleEditingMutation(mutation: MutationRecord) {
  if (mutation.type !== "attributes" || mutation.attributeName !== "data-editing") {
    return
  }
  const el = mutation.target as Element
  // 找到被事务更新的代码块（自身或祖先）
  const codeBlock = el.matches(".code-block")
    ? el
    : el.closest(".code-block")
  if (codeBlock) {
    unfoldAll(codeBlock as HTMLElement)
  }
}
