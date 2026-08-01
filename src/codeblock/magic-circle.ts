/**
 * 代码块美化插件 - 魔法阵背景主题
 *
 * 按「有效魔法阵」结构生成：魔法核（必选）/ 外阵图芒星（必选）/
 * 外魔法环与势（必选）/ 魔法引与魔法文（随机）/ 辅助（可选）。
 * 多魔法阵随机生成：数量按行数、大小/位置/颜色/层数随机、
 * 重叠度 < 20%、空白优先、3 分钟生命周期、文档切换只保留当前文档。
 */
import type { CodeBlockSettings } from "./settings"
import { ENHANCED_VALUE } from "../utils/dom"
import { countVisibleLines } from "../utils/text-range"
import { isFolded } from "./longcode"
import { buildMagicSvg } from "./magic-layers"

const MAGIC_LIFETIME_MS = 3 * 60 * 1000
/** 每个代码块的魔法阵生命周期计时器（用于清理） */
const magicTimers = new WeakMap<HTMLElement, number[]>()

export function clearMagicTimers(codeBlock: HTMLElement) {
  const timers = magicTimers.get(codeBlock)
  if (timers) {
    for (const t of timers) {
      window.clearTimeout(t)
    }
    magicTimers.delete(codeBlock)
  }
}

/** 全局清理所有魔法阵（移除元素 + 停止计时器），文档切换时释放资源 */
export function clearAllMagicCircles() {
  document.querySelectorAll<HTMLElement>(".code-block.cb-beautified").forEach((block) => {
    removeMagicCircles(block)
  })
}

/** 移除单个代码块的魔法阵并清理计时器 */
export function removeMagicCircles(codeBlock: HTMLElement) {
  codeBlock.querySelectorAll(".cb-magic-circle").forEach((el) => el.remove())
  clearMagicTimers(codeBlock)
}



interface MagicPlacement {
  leftPct: number
  topPct: number
  r: number
}

function circleOverlapRatio(r1: number, r2: number, d: number): number {
  if (d >= r1 + r2) {
    return 0
  }
  if (d <= Math.abs(r1 - r2)) {
    return 1
  }
  const a1 = Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1))
  const a2 = Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2))
  const chord = Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2))
  const area = r1 * r1 * a1 + r2 * r2 * a2 - 0.5 * chord
  return area / (Math.PI * Math.min(r1, r2) * Math.min(r1, r2))
}

function overlapsTooMuch(candidate: MagicPlacement, existing: MagicPlacement[], blockW: number, blockH: number): boolean {
  const cx = (candidate.leftPct / 100) * blockW
  const cy = (candidate.topPct / 100) * blockH
  for (const q of existing) {
    const qx = (q.leftPct / 100) * blockW
    const qy = (q.topPct / 100) * blockH
    const d = Math.hypot(cx - qx, cy - qy)
    if (circleOverlapRatio(candidate.r, q.r, d) >= 0.2) {
      return true
    }
  }
  return false
}

function collectPlacements(codeBlock: HTMLElement): MagicPlacement[] {
  const list: MagicPlacement[] = []
  codeBlock.querySelectorAll<HTMLElement>(".cb-magic-circle").forEach((el) => {
    const w = Number.parseFloat(el.style.width) || 0
    if (w <= 0) {
      return
    }
    list.push({
      leftPct: Number.parseFloat(el.style.left) || 0,
      topPct: Number.parseFloat(el.style.top) || 0,
      r: w / 2,
    })
  })
  return list
}

/** 轻量 Canvas 光带特效：沿圆周流动的发光粒子 + 尾迹（元素移除后自动停止） */
function startCanvasEffect(el: HTMLElement, color: string, size: number) {
  const canvas = document.createElement("canvas")
  canvas.className = "cb-mg-canvas"
  canvas.width = Math.max(64, Math.round(size))
  canvas.height = canvas.width
  el.appendChild(canvas)
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    return
  }
  const cx = canvas.width / 2
  const cy = canvas.height / 2
  const count = 6 + Math.floor(Math.random() * 5) // 6-10 个光点
  const radius = canvas.width * (0.3 + Math.random() * 0.12) // 光带半径随机
  const particles = Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5
    const speed = 0.004 + Math.random() * 0.005
    const trail: { x: number, y: number }[] = []
    return {
      angle,
      speed,
      trail,
    }
  })
  const tick = () => {
    // 元素被移除后自动停止动画（无需外部清理）
    if (!el.isConnected) {
      return
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.shadowColor = color
    ctx.shadowBlur = 4
    ctx.fillStyle = color
    for (const p of particles) {
      p.angle += p.speed
      const x = cx + Math.cos(p.angle) * radius
      const y = cy + Math.sin(p.angle) * radius
      p.trail.push({
        x,
        y,
      })
      if (p.trail.length > 8) {
        p.trail.shift()
      }
      // 尾迹（渐隐）
      p.trail.forEach((t, idx) => {
        ctx.globalAlpha = ((idx + 1) / p.trail.length) * 0.45
        ctx.beginPath()
        ctx.arc(t.x, t.y, 1.6, 0, Math.PI * 2)
        ctx.fill()
      })
      // 主光点
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.arc(x, y, 3.2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    window.requestAnimationFrame(tick)
  }
  window.requestAnimationFrame(tick)
}

/** 指定位置/尺寸生成魔法阵（forced 用于卫星阵等固定布局，调用方保证重叠约束） */
interface MagicForced {
  size: number
  leftPct: number
  topPct: number
}

/** 随机放置：优先「空白处」（代码较短行右侧），其次随机；均通过重叠检查 */
function randomPlacement(
  codeBlock: HTMLElement,
  size: number,
  blockWidth: number,
  blockHeight: number,
  threshold: number,
  existing: MagicPlacement[],
): { leftPct: number, topPct: number } {
  // 空白行 = 可视区域内文本长度 < max(20, 平均长度×60%) 的行
  const hljsEl = codeBlock.querySelector<HTMLElement>(".hljs")
  const lines = (hljsEl?.textContent ?? "").split("\n")
  const visibleRows = isFolded(codeBlock)
    ? Math.max(1, threshold)
    : Math.max(1, lines.length)
  const avgLen = lines.slice(0, visibleRows).reduce((sum, l) => sum + l.trim().length, 0) / visibleRows
  const sparseThreshold = Math.max(20, avgLen * 0.6)
  const sparseRows: number[] = []
  for (let i = 0; i < Math.min(visibleRows, lines.length); i++) {
    if (lines[i].trim().length < sparseThreshold) {
      sparseRows.push(i)
    }
  }
  const rowHeight = blockHeight / visibleRows
  const r = size / 2
  let leftPct = 12 + Math.random() * 68
  let topPct = 8 + Math.random() * 75
  for (let attempt = 0; attempt < 12; attempt++) {
    let lp: number
    let tp: number
    if (sparseRows.length > 0 && Math.random() < 0.7) {
      // 空白优先：落在短行所在行，水平偏右（代码右侧空白大）
      const row = sparseRows[Math.floor(Math.random() * sparseRows.length)]
      tp = Math.max(5, Math.min(92, (row * rowHeight) / blockHeight * 100))
      lp = 45 + Math.random() * 42
    } else {
      // 随机位置（避开左侧行号列区域）
      lp = 12 + Math.random() * 68
      tp = 8 + Math.random() * 75
    }
    if (!overlapsTooMuch({
      leftPct: lp,
      topPct: tp,
      r,
    }, existing, blockWidth, blockHeight)) {
      leftPct = lp
      topPct = tp
      break
    }
  }
  return {
    leftPct,
    topPct,
  }
}

/** 粒子特效：随机添加（约 70% 概率），数量 8-20 个，随机位置/大小/颜色/动画 */
function addParticles(el: HTMLElement) {
  if (Math.random() >= 0.7) {
    return
  }
  const particles = 8 + Math.floor(Math.random() * 13)
  for (let p = 0; p < particles; p++) {
    const pt = document.createElement("span")
    pt.className = "cb-mg-particle"
    pt.style.left = `${Math.random() * 100}%`
    pt.style.top = `${Math.random() * 100}%`
    const ptSize = `${2 + Math.random() * 3}px`
    pt.style.width = ptSize
    pt.style.height = ptSize
    pt.style.background = `hsl(${Math.floor(Math.random() * 360)} 90% 72%)`
    pt.style.animationDelay = `${Math.random() * -4}s`
    pt.style.animationDuration = `${3 + Math.random() * 4}s`
    el.appendChild(pt)
  }
}

function spawnMagicCircle(
  codeBlock: HTMLElement,
  existing: MagicPlacement[],
  threshold: number,
  forced?: MagicForced,
) {
  const el = document.createElement("div")
  el.className = "cb-magic-circle"
  el.setAttribute("contenteditable", "false")
  // 大小随机 350-700px，但不超过代码块当前可视高度的 85%（收起后避免超界被裁剪）
  const blockHeight = codeBlock.offsetHeight || 0
  const blockWidth = codeBlock.offsetWidth || 600
  const sizeMax = blockHeight > 0 ? Math.min(700, blockHeight * 0.85) : 700
  let size: number
  let leftPct: number
  let topPct: number
  if (forced) {
    // 固定布局（卫星阵）：尺寸/位置由调用方指定
    size = forced.size
    leftPct = forced.leftPct
    topPct = forced.topPct
  } else {
    size = Math.max(200, Math.min(700, 350 + Math.random() * 350))
    const pos = randomPlacement(codeBlock, size, blockWidth, blockHeight, threshold, existing)
    leftPct = pos.leftPct
    topPct = pos.topPct
  }
  const actualSize = Math.min(size, sizeMax)
  el.style.width = `${actualSize}px`
  el.style.height = el.style.width
  existing.push({
    leftPct,
    topPct,
    r: actualSize / 2,
  })
  el.style.left = `${leftPct}%`
  el.style.top = `${topPct}%`
  el.style.transform = "translate(-50%, -50%)"
  // 颜色：随机色相（线条明暗由主题 CSS 自动适配——切换明/暗主题时魔法阵结构不变、仅颜色改变）
  el.style.setProperty("--cb-mg-hue", String(Math.floor(Math.random() * 360)))
  // 图层嵌套层数随机 3-6
  el.innerHTML = buildMagicSvg(3 + Math.floor(Math.random() * 4))

  // 粒子特效
  addParticles(el)

  codeBlock.insertBefore(el, codeBlock.firstChild)

  // 轻量 Canvas 光带特效：随机 60% 概率叠加（沿圆周流动的发光粒子 + 拖尾）
  if (Math.random() < 0.6) {
    const actualSize = Number.parseFloat(el.style.width) || size
    startCanvasEffect(el, getComputedStyle(el).color, actualSize)
  }

  // 3 分钟后消失，再随机生成新的。
  // 若元素已被外部移除（收起/展开刷新），则不再重生，避免数量翻倍
  const timer = window.setTimeout(() => {
    if (!el.isConnected) {
      return
    }
    el.remove()
    if (codeBlock.isConnected && codeBlock.dataset.cbEnhanced === ENHANCED_VALUE) {
      // 重生成时避让其余仍在的魔法阵
      spawnMagicCircle(codeBlock, collectPlacements(codeBlock), threshold)
    }
  }, MAGIC_LIFETIME_MS)
  const timers = magicTimers.get(codeBlock) ?? []
  timers.push(timer)
  magicTimers.set(codeBlock, timers)
}

/** 两圆重叠比例 ≤ maxRatio 时的最小中心距（二分求解） */
function minDistanceForOverlap(r1: number, r2: number, maxRatio: number): number {
  let lo = Math.max(0, r1 - r2)
  let hi = r1 + r2
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (circleOverlapRatio(r1, r2, mid) <= maxRatio) {
      hi = mid
    } else {
      lo = mid
    }
  }
  return hi
}

/** 卫星阵样式：中心主阵 + 周围 3 个小阵环绕（小阵与主阵重叠 ≤ 小阵面积 20%） */
function spawnSatelliteSet(codeBlock: HTMLElement, threshold: number) {
  const blockHeight = codeBlock.offsetHeight || 0
  const blockWidth = codeBlock.offsetWidth || 600
  const mainSize = Math.max(260, Math.min(420, blockHeight * 0.6))
  const smallSize = mainSize * (0.35 + Math.random() * 0.1)
  const mainR = mainSize / 2
  const smallR = smallSize / 2
  // 主阵居中
  const mainLeft = 50
  const mainTop = 50
  const existing: MagicPlacement[] = []
  spawnMagicCircle(codeBlock, existing, threshold, {
    size: mainSize,
    leftPct: mainLeft,
    topPct: mainTop,
  })
  // 3 个小阵：等边三角形环绕主阵，中心距 = 重叠恰好 ≤20% 的最小距离
  const d = minDistanceForOverlap(mainR, smallR, 0.2)
  const base = Math.random() * Math.PI * 2
  for (let i = 0; i < 3; i++) {
    const angle = base + (Math.PI * 2 / 3) * i
    const dxPct = (d * Math.cos(angle)) / blockWidth * 100
    const dyPct = (d * Math.sin(angle)) / blockHeight * 100
    spawnMagicCircle(codeBlock, existing, threshold, {
      size: smallSize,
      leftPct: Math.max(5, Math.min(95, mainLeft + dxPct)),
      topPct: Math.max(5, Math.min(95, mainTop + dyPct)),
    })
  }
}

export function applyBackgroundTheme(codeBlock: HTMLElement, s: CodeBlockSettings) {
  const existing = codeBlock.querySelectorAll(".cb-magic-circle")
  if (s.backgroundTheme !== "magic-circle") {
    // 关闭主题：移除所有魔法阵并清理计时器
    existing.forEach((el) => el.remove())
    clearMagicTimers(codeBlock)
    return
  }
  // 已有魔法阵：保持稳定（滚动 / 重扫 / verify 不重新生成，仅当元素丢失时补齐）
  if (existing.length > 0) {
    return
  }
  // 卫星阵样式：开启时约 30% 概率采用「主阵 + 3 小阵」布局（重叠 ≤ 小阵 20%）
  if (s.magicSatellite && Math.random() < 0.3) {
    spawnSatelliteSet(codeBlock, s.longCodeThreshold)
    return
  }
  // 数量：收起状态按固定行号阈值每 10 行 1 个；否则按代码行数每 20 行 1 个（至少 1 个）
  let count = 1
  if (isFolded(codeBlock)) {
    count = Math.max(1, Math.floor(s.longCodeThreshold / 10))
  } else {
    const hljs = codeBlock.querySelector<HTMLElement>(".hljs")
    const lineCount = hljs ? countVisibleLines(hljs.textContent ?? "") : 1
    count = Math.max(1, Math.floor(lineCount / 20))
  }
  const placements: MagicPlacement[] = []
  for (let i = 0; i < count; i++) {
    spawnMagicCircle(codeBlock, placements, s.longCodeThreshold)
  }
}
