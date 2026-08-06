/**
 * 独立折叠箭头：与行号列解耦，原生行号 / 插件行号下都可用。
 *
 * 背景：折叠箭头原挂在插件行号列的行内（VS Code 风格），双轨方案下
 * 原生行号启用时插件行号列不渲染 → 箭头丢失。本模块把箭头独立渲染到
 * overlay，定位不依赖插件行号列。
 *
 * 定位：用 splitLineNodeGroups 按行节点组的 offsetTop（不依赖文本偏移——
 * 折叠后省略行会改变 textContent 行数，节点组定位天然一致）。
 */
import { getCodeText } from "../utils/dom"
import { getOverlay } from "../utils/overlay"
import { splitLineNodeGroups } from "../utils/text-range"
import { findFoldRegions } from "./fold"
import {
  getFoldState,
  toggleFold,
} from "./folding"
import { getCodeBlockLanguage } from "./language"
import {
  ensureEnhanced,
  registerDecor,
  registerRenderer,
} from "./registry"

const ARROWS_CLASS = "cb-fold-arrows"
const ARROW_CLASS = "cb-fold-arrow"

/** 每代码块的箭头层（防重复创建） */
const arrowsLayer = new WeakMap<HTMLElement, HTMLElement>()
/** 已安装 .hljs 内部滚动跟随的代码块（长代码收起后内部滚动时箭头跟随内容） */
const scrollFollowInstalled = new WeakSet<HTMLElement>()

/** 获取（或创建）折叠箭头层（overlay 内，absolute 覆盖） */
function getArrowsLayer(codeBlock: HTMLElement): HTMLElement {
  let layer = arrowsLayer.get(codeBlock)
  if (!layer || !layer.isConnected) {
    layer = document.createElement("div")
    layer.className = ARROWS_CLASS
    layer.setAttribute("contenteditable", "false")
    getOverlay(codeBlock).appendChild(layer)
    arrowsLayer.set(codeBlock, layer)
    // 长代码收起后 .hljs 内部滚动：箭头层整体随内容上移（减 scrollTop）
    const hljs = codeBlock.querySelector<HTMLElement>(".hljs")
    if (hljs && !scrollFollowInstalled.has(codeBlock)) {
      scrollFollowInstalled.add(codeBlock)
      hljs.addEventListener("scroll", () => {
        layer.style.transform = `translateY(${-hljs.scrollTop}px)`
      }, { passive: true })
    }
  }
  return layer
}

/**
 * 渲染折叠箭头（幂等：先清空再渲染，随代码块内容/语言变化刷新）。
 * 定位：行节点组 offsetTop（不依赖文本偏移，折叠后依然准确）。
 */
function renderFoldArrows(codeBlock: HTMLElement, hljs: HTMLElement, text: string) {
  const layer = getArrowsLayer(codeBlock)
  layer.textContent = ""
  const language = getCodeBlockLanguage(codeBlock)
  const regions = findFoldRegions(text, language)
  if (regions.length === 0) {
    return
  }
  const overlay = getOverlay(codeBlock)
  const hljsRect = hljs.getBoundingClientRect()
  const overlayRect = overlay.getBoundingClientRect()
  const baseY = hljsRect.top - overlayRect.top
  // 行节点组：每组的 offsetTop 定位箭头（折叠后省略行也算一行，行号对齐）
  const rows = splitLineNodeGroups(hljs)
  const rowTop = (idx: number): number => {
    const row = rows[idx]
    if (!row || row.length === 0) {
      return 0
    }
    // 组内第一个元素节点（span/省略行 div）的 offsetTop 相对 hljs；
    // 文本节点无 offsetTop，跳过取下一个
    for (const n of row) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        return (n as HTMLElement).offsetTop
      }
    }
    // 全文本行：用 Range 测首字符位置（该行文本节点起点）
    const first = row[0]
    const range = document.createRange()
    range.setStart(first, 0)
    range.setEnd(first, Math.min(1, (first as Text).data.length))
    return range.getBoundingClientRect().top - hljs.getBoundingClientRect().top
  }
  // 注册刷新回调（折叠/展开后 rerenderBlock 触发箭头方向更新）
  registerRenderer(codeBlock, () => refreshFoldArrows(codeBlock))
  for (const region of regions) {
    // 已折叠区域由省略行承载展开入口，行号列不渲染箭头
    if (region.start >= rows.length || isRegionFolded(codeBlock, region.start)) {
      continue
    }
    // 创建折叠箭头按钮（点击调用 folding 的 toggleFold）
    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = `${ARROW_CLASS} cb-fold-btn`
    btn.title = "折叠代码块"
    btn.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      toggleFold(codeBlock, region.start)
      refreshFoldArrows(codeBlock)
    })
    btn.style.top = `${baseY + rowTop(region.start)}px`
    layer.appendChild(btn)
  }
}

/** 区域是否已折叠（folding 的 state.areas 含该 start） */
function isRegionFolded(codeBlock: HTMLElement, start: number): boolean {
  const state = getFoldState(codeBlock)
  return state ? state.areas.some((a) => a.start === start) : false
}

/** 清理折叠箭头层（卸载/设置变更时调用） */
function clearFoldArrows(codeBlock: HTMLElement) {
  arrowsLayer.get(codeBlock)?.remove()
  arrowsLayer.delete(codeBlock)
  // 一并释放滚动跟随标记，重扫/设置变更后重建层时重新绑定
  scrollFollowInstalled.delete(codeBlock)
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
  // 防御：若该块从未被完整增强（懒加载/IO 未触发），先触发完整增强
  if (!ensureEnhanced(codeBlock)) {
    return
  }
  // 长代码已收起时隐藏代码内折叠箭头（方案1：两套折叠不叠加）
  if (codeBlock.dataset.cbLongFolded) {
    clearFoldArrows(codeBlock)
    return
  }
  renderFoldArrows(codeBlock, hljs, getCodeText(hljs))
}

registerDecor({
  selfSelector: `.${ARROWS_CLASS}, .${ARROWS_CLASS} *`,
  enhance: (ctx) => {
    // 代码块增强时渲染折叠箭头（幂等：renderFoldArrows 先清空再渲染）
    if (ctx.hljs && ctx.settings.foldEnabled && !ctx.codeBlock.dataset.cbLongFolded) {
      renderFoldArrows(ctx.codeBlock, ctx.hljs, getCodeText(ctx.hljs))
    }
  },
  cleanup: (codeBlock) => {
    clearFoldArrows(codeBlock)
  },
})
