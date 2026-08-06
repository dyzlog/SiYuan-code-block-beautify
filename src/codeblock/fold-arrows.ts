/**
 * 独立折叠箭头：与行号列解耦，原生行号 / 插件行号下都可用。
 *
 * 背景：折叠箭头原挂在插件行号列的行内（VS Code 风格），双轨方案下
 * 原生行号启用时插件行号列不渲染 → 箭头丢失。本模块把箭头独立渲染到
 * overlay，定位不依赖插件行号列。
 *
 * 定位：measureLineAt 精确测量第 start 行的真实 top（相对 .hljs），
 * 再加 hljs 相对 overlay 的偏移——不依赖等高行假设，兼容 padding/装饰栏。
 */
import { getCodeText } from "../utils/dom"
import { getOverlay } from "../utils/overlay"
import { findFoldRegions } from "./fold"
import {
  getFoldState,
  makeFoldBtn,
} from "./folding"
import { getCodeBlockLanguage } from "./language"
import { measureLineAt } from "./line-measure-service"
import {
  ensureEnhanced,
  registerDecor,
  registerRenderer,
} from "./registry"

const ARROWS_CLASS = "cb-fold-arrows"
const ARROW_CLASS = "cb-fold-arrow"

/** 每代码块的箭头层（防重复创建） */
const arrowsLayer = new WeakMap<HTMLElement, HTMLElement>()

/** 获取（或创建）折叠箭头层（overlay 内，absolute 覆盖） */
function getArrowsLayer(codeBlock: HTMLElement): HTMLElement {
  let layer = arrowsLayer.get(codeBlock)
  if (!layer || !layer.isConnected) {
    layer = document.createElement("div")
    layer.className = ARROWS_CLASS
    layer.setAttribute("contenteditable", "false")
    getOverlay(codeBlock).appendChild(layer)
    arrowsLayer.set(codeBlock, layer)
  }
  return layer
}

/**
 * 渲染折叠箭头（幂等：先清空再渲染，随代码块内容/语言变化刷新）。
 * 定位：折叠区域起点行的 y = 行号 × 行高（等高模式）。
 */
function renderFoldArrows(
  codeBlock: HTMLElement,
  hljs: HTMLElement,
  text: string,
  enabled: boolean,
) {
  const layer = getArrowsLayer(codeBlock)
  layer.textContent = ""
  if (!enabled) {
    return
  }
  const language = getCodeBlockLanguage(codeBlock)
  const regions = findFoldRegions(text, language)
  if (regions.length === 0) {
    return
  }
  const overlay = getOverlay(codeBlock)
  const hljsRect = hljs.getBoundingClientRect()
  const overlayRect = overlay.getBoundingClientRect()
  const baseY = hljsRect.top - overlayRect.top
  const state = getFoldState(codeBlock)
  const foldedStarts = new Set<number>()
  if (state) {
    for (const a of state.areas) {
      foldedStarts.add(a.start)
    }
  }
  // 注册刷新回调（折叠/展开后 rerenderBlock 触发箭头方向更新）
  registerRenderer(codeBlock, () => refreshFoldArrows(codeBlock))
  // 定位：只精确测量前两个区域，推算等行高（思源代码块等高行），
  // 其余区域用等差推算——避免每区域一次 Range 测量（reflow），N 次 → 2 次
  const regionsTop = regions.length
  let firstTop = 0
  let stride = 0
  if (regionsTop > 0) {
    firstTop = measureLineAt(hljs, text, regions[0].start).top
    if (regionsTop > 1 && regions[1].start > regions[0].start) {
      const secondTop = measureLineAt(hljs, text, regions[1].start).top
      stride = (secondTop - firstTop) / (regions[1].start - regions[0].start)
    }
  }
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i]
    const btn = makeFoldBtn(codeBlock, region.start, foldedStarts.has(region.start))
    btn.className = `${btn.className} ${ARROW_CLASS}`
    const top = i === 0
      ? firstTop
      : stride > 0
        ? firstTop + (region.start - regions[0].start) * stride
        : measureLineAt(hljs, text, region.start).top
    btn.style.top = `${baseY + top}px`
    layer.appendChild(btn)
  }
}

/** 清理折叠箭头层（卸载/设置变更时调用） */
function clearFoldArrows(codeBlock: HTMLElement) {
  arrowsLayer.get(codeBlock)?.remove()
  arrowsLayer.delete(codeBlock)
}

/**
 * 刷新折叠箭头（折叠/展开后调用，更新箭头方向）。
 * 通过 registry 注册到该代码块，供 rerenderBlock 统一触发。
 */
function refreshFoldArrows(codeBlock: HTMLElement) {
  const hljs = codeBlock.querySelector<HTMLElement>(".hljs")
  if (!hljs) {
    return
  }
  // 防御：若该块从未被完整增强（懒加载/IO 未触发），先触发完整增强——
  // 否则 rerenderBlock 只渲染箭头层，产生「点击才出现残缺渲染」的问题。
  // 经 registry 的 ensureEnhanced 触发（不再用全局 window 钩子）
  if (!ensureEnhanced(codeBlock)) {
    return
  }
  renderFoldArrows(codeBlock, hljs, getCodeText(hljs), true)
}

registerDecor({
  selfSelector: `.${ARROWS_CLASS}, .${ARROWS_CLASS} *`,
  enhance: (ctx) => {
    // 代码块增强时渲染折叠箭头（幂等：renderFoldArrows 先清空再渲染）
    if (ctx.hljs && ctx.settings.foldEnabled) {
      renderFoldArrows(ctx.codeBlock, ctx.hljs, getCodeText(ctx.hljs), true)
    }
  },
  cleanup: (codeBlock) => {
    clearFoldArrows(codeBlock)
  },
})
