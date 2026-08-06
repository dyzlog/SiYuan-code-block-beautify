/**
 * 魔卡小樱（库洛牌）风格魔法阵 SVG 生成。
 *
 * 基于所罗门魔法阵构成（环形分层 + 密集符文 + 射线状），对标库洛牌：
 * - 魔法核：中心小圆 + 内圈三角阵
 * - 外阵图：五芒星，顶点延伸至中环
 * - 魔法引：星顶点上挂小圆
 * - 势：外环外圈放射线（能量射线）
 * - 祈祷文：外环与中环之间的符文带（环状小符号序列）
 * - 外魔法环：双环 + 环间符文带（消弱文）
 * - 外魔法文：4 方位符号（炼金/行星符号）
 *
 * 配色：库洛牌经典——玫粉 #e89ab8 + 金 #d4a017 + 淡粉 #f7d6e0
 * 静态发光（feGaussianBlur），不旋转。
 */

const PINK = "#e89ab8"
const GOLD = "#d4a017"
const LIGHT_PINK = "#f7d6e0"
const DEEP_PINK = "#c96a8e"

/** 生成单个完整魔法阵（环形分层结构） */
function magicCircle(
  cx: number,
  cy: number,
  r: number,
  id: string,
  opts: {
    rays?: boolean
    runes?: boolean
  } = {},
): string {
  const {
    rays = true,
    runes = true,
  } = opts
  const thin = (r * 0.012).toFixed(1)
  const med = (r * 0.02).toFixed(1)

  // 五芒星：顶点延伸至中环（r*0.85），内凹点 r*0.34
  const starPoints: string[] = []
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    const rad = i % 2 === 0 ? r * 0.85 : r * 0.34
    starPoints.push(`${(cx + rad * Math.cos(angle)).toFixed(1)},${(cy + rad * Math.sin(angle)).toFixed(1)}`)
  }
  // 星顶点挂小圆（魔法引）
  const starTips: string[] = []
  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5
    const x = cx + r * 0.85 * Math.cos(angle)
    const y = cy + r * 0.85 * Math.sin(angle)
    starTips.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 0.045).toFixed(1)}" fill="none" stroke="${GOLD}" stroke-width="${thin}"/>`)
  }
  // 外环外圈放射线（势）
  const rayLines: string[] = []
  if (rays) {
    const rayCount = 24
    for (let i = 0; i < rayCount; i++) {
      const angle = (i * 2 * Math.PI) / rayCount
      const inner = r * 1.0
      const outer = r * (i % 2 === 0 ? 1.12 : 1.07)
      const x1 = cx + inner * Math.cos(angle)
      const y1 = cy + inner * Math.sin(angle)
      const x2 = cx + outer * Math.cos(angle)
      const y2 = cy + outer * Math.sin(angle)
      rayLines.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${LIGHT_PINK}" stroke-width="${thin}" opacity="0.7"/>`)
    }
  }
  // 外环与中环之间符文带（祈祷文）
  const runeDots: string[] = []
  if (runes) {
    const count = 12
    for (let i = 0; i < count; i++) {
      const angle = (i * 2 * Math.PI) / count
      const x = cx + r * 0.92 * Math.cos(angle)
      const y = cy + r * 0.92 * Math.sin(angle)
      runeDots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 0.035).toFixed(1)}" fill="${GOLD}" opacity="0.85"/>`)
    }
  }
  // 4 方位符号（外魔法文）：用小三角/小菱形几何符号代替 text（背景 SVG 的 text 渲染不可靠）
  const quadrants: string[] = []
  for (let i = 0; i < 4; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 2
    const x = cx + r * 1.0 * Math.cos(angle)
    const y = cy + r * 1.0 * Math.sin(angle)
    const s = r * 0.045
    // 菱形（方位标记）
    quadrants.push(`<polygon points="${x.toFixed(1)},${(y - s).toFixed(1)} ${(x + s).toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${(y + s).toFixed(1)} ${(x - s).toFixed(1)},${y.toFixed(1)}" fill="${DEEP_PINK}" opacity="0.9"/>`)
  }
  // 中心魔法核：内圈三角阵
  const core = `
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.14).toFixed(1)}" fill="none" stroke="${GOLD}" stroke-width="${med}"/>
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.05).toFixed(1)}" fill="${DEEP_PINK}" opacity="0.9"/>`

  return `
  <g filter="url(#${id}-glow)">
    <!-- 外魔法环（最外，金细） -->
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${GOLD}" stroke-width="${thin}" opacity="0.75"/>
    <!-- 中环（玫粉粗，外魔法环内沿） -->
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.78).toFixed(1)}" fill="none" stroke="${PINK}" stroke-width="${med}" opacity="0.85"/>
    <!-- 内环（淡粉，内魔法环） -->
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.58).toFixed(1)}" fill="none" stroke="${LIGHT_PINK}" stroke-width="${thin}" opacity="0.9"/>
    <!-- 外圈放射线（势） -->
    ${rayLines.join("\n    ")}
    <!-- 五芒星（外阵图，顶点至中环） -->
    <polygon points="${starPoints.join(" ")}" fill="none" stroke="${DEEP_PINK}" stroke-width="${thin}" opacity="0.85"/>
    <!-- 星顶点小圆（魔法引） -->
    ${starTips.join("\n    ")}
    <!-- 符文带（祈祷文，外环与中环之间） -->
    ${runeDots.join("\n    ")}
    <!-- 4 方位符号（外魔法文） -->
    ${quadrants.join("\n    ")}
    <!-- 魔法核 -->
    ${core}
  </g>`
}

/** 生成完整 SVG（含发光 filter 定义） */
function buildSvg(parts: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
  <defs>
    <filter id="main-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="small-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="1.5" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
${parts.join("\n")}
</svg>`
}

/**
 * 生成库洛牌魔法阵背景 SVG data URI。
 * 布局：一个大阵（居中偏右）+ 2 个小阵（左下/右上点缀）。
 * 静态、发光、不旋转。
 */
export function buildSakuraBg(): string {
  // 大阵：居中偏右（x=290，y=200），半径 100
  const main = magicCircle(290, 200, 100, "main")
  // 小阵：简化（无射线无符文带，避免过密）
  const small1 = magicCircle(70, 330, 42, "small", {
    rays: false,
    runes: false,
  })
  const small2 = magicCircle(350, 55, 36, "small", {
    rays: false,
    runes: false,
  })
  const svg = buildSvg([main, small1, small2])
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
