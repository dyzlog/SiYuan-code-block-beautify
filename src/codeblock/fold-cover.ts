/**
 * 视觉遮盖折叠（方案④）：完全不改 .hljs DOM，折叠 = overlay 上的遮盖条。
 *
 * 背景：文本提取式折叠（Range/extractContents）在思源「高亮 span + 换行文本」
 * 结构下有累积偏移/污染风险。本方案改为纯视觉——代码内容始终完整，
 * 折叠区域由 overlay 的不透明遮盖条盖住，点遮盖条即展开。
 *
 * 优点：
 * - 零污染：.hljs DOM 从未改变，思源序列化读到的永远是完整代码
 * - 绝对可靠：无提取/恢复操作，不存在「打不开/错位」类 bug
 * - 语义：保留声明行可见（如 `if (a) {`），内部行折叠成一条省略遮盖
 */
import type { FoldRegion } from "./fold"
import { getCodeText } from "../utils/dom"
import { getOverlay } from "../utils/overlay"
import { findFoldRegions } from "./fold"
import { getCodeBlockLanguage } from "./language"
import { measureLineAt } from "./line-measure-service"
import { registerDecor } from "./registry"

const COVER_CLASS = "cb-fold-cover"

/** 每代码块已折叠的区域（原始行号） */
const foldedRegions = new WeakMap<HTMLElement, Map<number, FoldRegion>>()

/** 已绑定 focusin 展开监听的代码块（防重复绑定） */
const coverFocusBound = new WeakSet<HTMLElement>()

function getFoldedMap(codeBlock: HTMLElement): Map<number, FoldRegion> {
  let m = foldedRegions.get(codeBlock)
  if (!m) {
    m = new Map()
    foldedRegions.set(codeBlock, m)
  }
  return m
}

/**
 * 计算区域内部行（start+1..end）的遮盖条位置（相对 overlay，含 hljs 偏移）。
 * 视觉遮盖不改 DOM，文本恒定 → 行号恒定，measureLineAt 直接可用。
 */
function coverGeom(
  codeBlock: HTMLElement,
  hljs: HTMLElement,
  region: FoldRegion,
): {
  top: number
  height: number
} | null {
  // 起始行保留可见，遮盖 start+1 .. end（单行区域无需遮盖）
  if (region.start + 1 > region.end) {
    return null
  }
  const text = getCodeText(hljs)
  const overlay = getOverlay(codeBlock)
  const baseY = hljs.getBoundingClientRect().top - overlay.getBoundingClientRect().top
  const startRow = measureLineAt(hljs, text, region.start + 1)
  const endRow = measureLineAt(hljs, text, region.end)
  if (startRow.height <= 0 || endRow.height <= 0) {
    return null
  }
  return {
    top: baseY + startRow.top,
    height: (endRow.top + endRow.height) - startRow.top,
  }
}

/** 折叠：在 overlay 放遮盖条（保留声明行可见） */
function foldRegion(codeBlock: HTMLElement, region: FoldRegion) {
  const hljs = codeBlock.querySelector<HTMLElement>(".hljs")
  if (!hljs) {
    return
  }
  const geom = coverGeom(codeBlock, hljs, region)
  if (!geom) {
    return
  }
  const overlay = getOverlay(codeBlock)
  let cover = overlay.querySelector<HTMLElement>(`.${COVER_CLASS}[data-start="${region.start}"]`)
  if (!cover) {
    cover = document.createElement("div")
    cover.className = COVER_CLASS
    cover.setAttribute("contenteditable", "false")
    cover.dataset.start = String(region.start)
    cover.textContent = `⋯ 已折叠 ${region.end - region.start} 行`
    cover.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      unfoldRegion(codeBlock, region.start)
    })
    overlay.appendChild(cover)
  }
  cover.style.top = `${geom.top}px`
  cover.style.height = `${geom.height}px`
  getFoldedMap(codeBlock).set(region.start, region)
}

/** 展开：移除遮盖条 */
function unfoldRegion(codeBlock: HTMLElement, start: number) {
  getOverlay(codeBlock).querySelector(`.${COVER_CLASS}[data-start="${start}"]`)?.remove()
  getFoldedMap(codeBlock).delete(start)
}

/** 展开全部（编辑/卸载时调用） */
function unfoldAll(codeBlock: HTMLElement) {
  getOverlay(codeBlock).querySelectorAll(`.${COVER_CLASS}`).forEach((el) => el.remove())
  foldedRegions.delete(codeBlock)
}

/** 切换折叠/展开 */
function toggleFold(codeBlock: HTMLElement, start: number) {
  const map = getFoldedMap(codeBlock)
  if (map.has(start)) {
    unfoldRegion(codeBlock, start)
    return
  }
  const hljs = codeBlock.querySelector<HTMLElement>(".hljs")
  if (!hljs) {
    return
  }
  const language = getCodeBlockLanguage(codeBlock)
  const region = findFoldRegions(getCodeText(hljs), language).find((r) => r.start === start)
  if (region) {
    foldRegion(codeBlock, region)
  }
}

registerDecor({
  selfSelector: `.${COVER_CLASS}, .${COVER_CLASS} *`,
  enhance: (ctx) => {
    // 代码块增强时：长代码收起时禁用内折叠；否则恢复已折叠区域的遮盖条
    if (ctx.hljs && ctx.settings.foldEnabled && !ctx.codeBlock.dataset.cbLongFolded) {
      const folded = getFoldedMap(ctx.codeBlock)
      if (folded.size > 0) {
        // 重新渲染遮盖条（思源重渲染后 overlay 可能已重建）
        for (const region of folded.values()) {
          foldRegion(ctx.codeBlock, region)
        }
      }
      // 进入编辑时自动展开所有遮盖（折叠是视觉辅助，编辑需看到完整代码）
      if (!coverFocusBound.has(ctx.codeBlock)) {
        coverFocusBound.add(ctx.codeBlock)
        ctx.hljs.addEventListener("focusin", () => {
          if (getFoldedMap(ctx.codeBlock).size > 0) {
            unfoldAll(ctx.codeBlock)
          }
        })
      }
    }
  },
  cleanup: (codeBlock) => {
    coverFocusBound.delete(codeBlock)
    unfoldAll(codeBlock)
  },
})

/** 导出供 fold-arrows 使用：渲染箭头时跳过已折叠区域、点击切换 */
export function getFoldedStarts(codeBlock: HTMLElement): Set<number> {
  return new Set(getFoldedMap(codeBlock).keys())
}

export function toggleFoldCover(codeBlock: HTMLElement, start: number) {
  toggleFold(codeBlock, start)
}
