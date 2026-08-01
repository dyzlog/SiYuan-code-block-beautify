/**
 * VS Code 风格缩进竖线（indent guides）。
 *
 * 解析层：按"缩进层级栈"计算每个缩进层级的竖线段
 * （缩进不足的行断开、空行继承缩进、禁止跨块连线）。
 * 渲染层：不修改 .hljs 内容，仅叠加背景视觉层（z-index -1），随滚动同步。
 */
import {
  forEachTextNode,
  setScrollOffset,
} from "../utils/dom"

const INDENT_GUIDES_CLASS = "cb-indent-guides"
const INDENT_GUIDE_CLASS = "cb-indent-guide"

/** 缩进级别换算：tab 视为 4 空格 */
const TAB_SIZE = 4

/**
 * 计算每行的缩进空格数（tab 按 4 空格展开）。
 *  空行继承前一个非空行的缩进，使缩进竖线能连续穿过块内空行
 */
function computeIndentLevels(text: string): number[] {
  const indents: number[] = []
  let lastIndent = 0
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      indents.push(lastIndent)
      continue
    }
    let n = 0
    for (const ch of line) {
      if (ch === " ") {
        n++
      } else if (ch === "\t") {
        n += TAB_SIZE
      } else {
        break
      }
    }
    indents.push(n)
    lastIndent = n
  }
  return indents
}

/**
 * 精确测量代码字体下单个空格的宽度。
 *  优先用 .hljs 内实际的缩进空格（Range 测量，字体与真实渲染一致），
 *  回退到同字体临时探针
 */
function measureSpaceWidth(hljs: HTMLElement): number {
  const range = document.createRange()
  let result = 0
  forEachTextNode(hljs, (node) => {
    if (result > 0) {
      return
    }
    const data = node.data
    const spaceCount = (data.match(/^ +/) ?? [""])[0].length
    if (spaceCount >= 2) {
      range.setStart(node, 0)
      range.setEnd(node, spaceCount)
      const rect = range.getBoundingClientRect()
      if (rect.width > 0) {
        result = rect.width / spaceCount
      }
    }
  })
  if (result > 0) {
    return result
  }
  // 回退：同字体临时探针
  const cs = getComputedStyle(hljs)
  const probe = document.createElement("span")
  probe.style.position = "absolute"
  probe.style.visibility = "hidden"
  probe.style.whiteSpace = "pre"
  probe.style.fontFamily = cs.fontFamily
  probe.style.fontSize = cs.fontSize
  probe.style.fontWeight = cs.fontWeight
  probe.textContent = "          " // 10 个空格
  document.body.appendChild(probe)
  const width = probe.getBoundingClientRect().width / 10
  probe.remove()
  return width > 0 ? width : (Number.parseFloat(cs.fontSize) * 0.6 || 8)
}

/** 自动检测代码的缩进宽度（取最小非零缩进，兼容 2/4/8 空格等习惯） */
function detectIndentWidth(indents: number[]): number {
  let min = Number.MAX_SAFE_INTEGER
  for (const n of indents) {
    if (n > 0 && n < min) {
      min = n
    }
  }
  return min === Number.MAX_SAFE_INTEGER ? TAB_SIZE : min
}

interface GuideSegment {
  /** 缩进层级（1 基） */
  level: number
  /** 段起始行（0 基） */
  start: number
  /** 段结束行（0 基） */
  end: number
}

/**
 * 缩进层级栈：计算每个缩进层级的竖线段。
 * 规则：
 * - 每级线只在"缩进达到该层级"的连续行内绘制（缩进不足的行断开，禁止跨块连线）
 * - 空行已由 computeIndentLevels 继承前一行缩进，自然属于对应段
 * - 输出 [{ level, start, end }]，行号 0 基
 */
function buildGuideSegments(indents: number[], indentWidth: number): GuideSegment[] {
  const segments: GuideSegment[] = []
  const maxIndent = Math.max(...indents)
  for (let k = 1; k * indentWidth <= maxIndent; k++) {
    const threshold = k * indentWidth
    let start = -1
    for (let i = 0; i < indents.length; i++) {
      if (indents[i] >= threshold) {
        if (start === -1) {
          start = i
        }
      } else if (start !== -1) {
        segments.push({
          level: k,
          start,
          end: i - 1,
        })
        start = -1
      }
    }
    if (start !== -1) {
      segments.push({
        level: k,
        start,
        end: indents.length - 1,
      })
    }
  }
  return segments
}

/** 渲染缩进竖线（清空并重建视觉层） */
export function renderIndentGuides(
  codeBlock: HTMLElement,
  hljs: HTMLElement,
  text: string,
  tops: number[],
  heightAt: (i: number) => number,
  rainbow = false,
) {
  let guides = codeBlock.querySelector<HTMLElement>(`.${INDENT_GUIDES_CLASS}`)
  if (!guides) {
    guides = document.createElement("div")
    guides.className = INDENT_GUIDES_CLASS
    guides.setAttribute("contenteditable", "false")
    codeBlock.appendChild(guides)
  }
  guides.textContent = ""

  const indents = computeIndentLevels(text)
  if (indents.length === 0) {
    return
  }
  const spaceWidth = measureSpaceWidth(hljs)
  const indentWidth = detectIndentWidth(indents)
  const segments = buildGuideSegments(indents, indentWidth)
  // 竖线层高度 = 全部内容高度：滚动预览时 transform 平移才能覆盖所有行，
  // 否则滚动后竖线层底部露出空白（后面的行没有竖线）
  if (tops.length > 0) {
    guides.style.height = `${tops[tops.length - 1] + heightAt(tops.length - 1)}px`
  }
  if (segments.length === 0) {
    return
  }

  const frag = document.createDocumentFragment()
  for (const seg of segments) {
    const top = tops[seg.start]
    const bottom = tops[seg.end] + heightAt(seg.end)
    if (bottom <= top) {
      continue
    }
    const g = document.createElement("div")
    g.className = INDENT_GUIDE_CLASS
    // 竖线对齐块起始行的缩进：(级别-1) × 缩进宽度。
    // 例如 1 级竖线在 x=0（与 `if` 的 `i` 正下方对齐），2 级在 4 空格处，3 级在 8 空格处
    g.style.left = `${(seg.level - 1) * indentWidth * spaceWidth}px`
    g.style.top = `${top}px`
    g.style.height = `${bottom - top}px`
    // 彩虹模式：不同缩进层级不同颜色（黄金角步进色相）；否则用统一色（CSS 变量）
    if (rainbow) {
      g.style.backgroundColor = `hsl(${(seg.level * 47) % 360} 75% 50% / 0.75)`
    }
    frag.appendChild(g)
  }
  guides.appendChild(frag)
}

/** 同步缩进线层的滚动偏移（与行号列同步） */
export function syncIndentGuides(codeBlock: HTMLElement, scrollTop: number) {
  const guides = codeBlock.querySelector<HTMLElement>(`.${INDENT_GUIDES_CLASS}`)
  if (guides) {
    setScrollOffset(guides, -scrollTop)
  }
}
