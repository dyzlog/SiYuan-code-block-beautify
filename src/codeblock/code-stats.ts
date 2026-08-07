/**
 * 代码统计角标：代码块底部右下角显示行数 / 字符数。
 * 低透明度、pointer-events none，不影响滚动与交互。
 */
import { getCodeText } from "../utils/dom"
import { getOverlay } from "../utils/overlay"
import { countVisibleLines } from "../utils/text-range"
import {
  registerDecor,
} from "./registry"

/** 统计角标类名 */
const STATS_CLASS = "cb-stats-badge"

/** 各代码块的监听控制器（防重复 init 累积事件监听） */
const controllers = new WeakMap<HTMLElement, AbortController>()

/** 更新统计角标内容 */
function updateStats(codeBlock: HTMLElement) {
  const hljs = codeBlock.querySelector<HTMLElement>(".hljs")
  const badge = getOverlay(codeBlock).querySelector<HTMLElement>(`.${STATS_CLASS}`)
  if (!hljs || !badge) {
    return
  }
  const text = getCodeText(hljs)
  const lines = countVisibleLines(text)
  const chars = text.length
  badge.textContent = `${lines} 行 · ${chars} 字符`
}

/** 初始化代码统计角标（开启时创建；编辑中不统计，退出编辑后重新统计） */
function initCodeStats(codeBlock: HTMLElement, enabled: boolean) {
  if (!enabled) {
    removeCodeStats(codeBlock)
    return
  }
  const ov = getOverlay(codeBlock)
  let badge = ov.querySelector<HTMLElement>(`.${STATS_CLASS}`)
  // 先解除旧监听（设置开关/重扫可能重复初始化）
  controllers.get(codeBlock)?.abort()
  const ac = new AbortController()
  controllers.set(codeBlock, ac)
  if (!badge) {
    badge = document.createElement("div")
    badge.className = STATS_CLASS
    badge.setAttribute("contenteditable", "false")
    ov.appendChild(badge)
  }
  // 非编辑状态统计一次（打开文档 / 代码块渲染即统计）
  updateStats(codeBlock)
  // 编辑中不实时统计（避免干扰输入 / 性能开销）：
  // 退出编辑（focusout）时重新统计，反映编辑后的行数/字符数。
  const hljs = codeBlock.querySelector<HTMLElement>(".hljs")
  hljs?.addEventListener("focusout", () => updateStats(codeBlock), { signal: ac.signal })
}

/** 移除统计角标并解除监听 */
function removeCodeStats(codeBlock: HTMLElement) {
  controllers.get(codeBlock)?.abort()
  controllers.delete(codeBlock)
  getOverlay(codeBlock).querySelector(`.${STATS_CLASS}`)?.remove()
}

registerDecor({
  selfSelector: ".cb-stats-badge",
  enhance: ({
    codeBlock,
    settings,
  }) => {
    initCodeStats(codeBlock, settings.codeStats)
  },
  cleanup: (codeBlock) => {
    removeCodeStats(codeBlock)
  },
})

