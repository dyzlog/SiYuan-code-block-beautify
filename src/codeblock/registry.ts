/**
 * 行号列渲染器注册表。
 * 行号列渲染（linenumbers）与折叠操作（folding）都需要触发重渲染，
 * 通过本注册表解耦，避免模块间循环依赖。
 */

const blockRenderers = new WeakMap<HTMLElement, () => void>()

/** 注册某个代码块的行号列渲染器 */
export function registerRenderer(codeBlock: HTMLElement, render: () => void): void {
  blockRenderers.set(codeBlock, render)
}

/** 触发某个代码块的行号列重渲染（若已注册） */
export function rerenderBlock(codeBlock: HTMLElement): void {
  blockRenderers.get(codeBlock)?.()
}
