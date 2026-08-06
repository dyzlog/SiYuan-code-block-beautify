/**
 * 魔卡小樱（库洛牌）风格魔法阵 SVG 生成。
 *
 * 风格：经典库洛牌——玫粉（#e89ab8）+ 金（#d4a017）+ 淡粉（#f7d6e0）
 * 元素：三层同心圆环 + 五芒星 + 符文点 + 花瓣点缀
 * 发光：SVG filter（高斯模糊）制造静态光晕，不旋转（性能友好）
 *
 * 主阵：代码块内大阵（上下居中、靠右）
 * 小阵：右下角/角落点缀
 */

/** 库洛牌配色 */
const PINK = "#e89ab8"
const GOLD = "#d4a017"
const LIGHT_PINK = "#f7d6e0"
const DEEP_PINK = "#c96a8e"

/** 生成单个魔法阵（五芒星 + 双圆环 + 符文点） */
function magicCircle(cx: number, cy: number, r: number, id: string): string {
  // 五芒星顶点（外半径 r*0.62，内半径 r*0.25）
  const starPoints: string[] = []
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    const rad = i % 2 === 0 ? r * 0.62 : r * 0.25
    const x = cx + rad * Math.cos(angle)
    const y = cy + rad * Math.sin(angle)
    starPoints.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  // 符文点：圆环上 8 个等距小圆
  const runeDots: string[] = []
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 + Math.PI / 8
    const x = cx + r * 0.82 * Math.cos(angle)
    const y = cy + r * 0.82 * Math.sin(angle)
    runeDots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 0.05).toFixed(1)}" fill="${GOLD}" opacity="0.9"/>`)
  }
  // 花瓣点缀：4 个方向的小花瓣
  const petals: string[] = []
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2
    const x = cx + r * 0.45 * Math.cos(angle)
    const y = cy + r * 0.45 * Math.sin(angle)
    petals.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 0.07).toFixed(1)}" fill="${LIGHT_PINK}" opacity="0.8"/>`)
  }

  return `
  <g filter="url(#${id}-glow)">
    <!-- 外环（金，细） -->
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${GOLD}" stroke-width="${(r * 0.03).toFixed(1)}" opacity="0.7"/>
    <!-- 中环（玫粉，粗） -->
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.82).toFixed(1)}" fill="none" stroke="${PINK}" stroke-width="${(r * 0.045).toFixed(1)}" opacity="0.8"/>
    <!-- 内环（淡粉，细） -->
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.68).toFixed(1)}" fill="none" stroke="${LIGHT_PINK}" stroke-width="${(r * 0.02).toFixed(1)}" opacity="0.9"/>
    <!-- 五芒星 -->
    <polygon points="${starPoints.join(" ")}" fill="none" stroke="${DEEP_PINK}" stroke-width="${(r * 0.03).toFixed(1)}" opacity="0.85"/>
    <!-- 符文点 -->
    ${runeDots.join("\n    ")}
    <!-- 花瓣点缀 -->
    ${petals.join("\n    ")}
  </g>`
}

/** 生成完整 SVG（含发光 filter 定义） */
function buildSvg(parts: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
  <defs>
    <filter id="main-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="small-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
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
 * 布局：一个大阵（居中偏右，上下居中）+ 2 个小阵（左下/右下点缀）。
 * 静态、发光、不旋转——性能友好，适合作为代码块背景。
 */
export function buildSakuraBg(): string {
  // 大阵：居中偏右（x=290，y=200），半径 110
  const main = magicCircle(290, 200, 110, "main")
  // 小阵：左下 + 右下角点缀
  const small1 = magicCircle(70, 330, 45, "small")
  const small2 = magicCircle(355, 60, 38, "small")
  const svg = buildSvg([main, small1, small2])
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
