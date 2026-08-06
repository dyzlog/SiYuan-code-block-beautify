/**
 * 魔卡小樱（库洛牌）风格魔法阵 SVG 生成——基于参数化几何蓝图。
 *
 * 坐标系：画布中心 = 原点 (0,0)，正上方 = 0°，顺时针为正。
 * R = 500（外圈半径），viewBox 1024x1024 居中裁剪。
 *
 * 结构（由外而内）：
 * 1. 外环 + 60 等分刻度带（占星盘刻度，每 30° 加长）
 * 2. 4 方位符文：正上太阳符文 + 右/右下/左下 3 个凯尔特结（不对称，打破对称）
 * 3. 中层：20 条放射线 + 五角星顶点骨架网格
 * 4. 核心：五芒星（外顶点 0.6R / 内凹 0.25R）+ 内圈（0.28R 包裹凹槽）+ 大内环（0.6R 带 60 刻度）
 * 5. 偏心圆（左下 -0.35R,0.25R 半径 0.24R）+ 新月形刻度轨道（贝塞尔弧 + 轨道齿痕）
 *
 * 配色：藕粉 #E6A5B3，主线条 1.5px，刻度 1px/0.8，核心 2.5-3px。
 * 静态发光（feGaussianBlur），不旋转。
 */

const COLOR = "#E6A5B3"
const R = 500

/** 极坐标 → 画布坐标（0° 正上，顺时针） */
function pt(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180
  return [r * Math.sin(rad), -r * Math.cos(rad)]
}

/** 画圆 */
function circle(cx: number, cy: number, r: number, w = 1.5, opacity = 1): string {
  return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${COLOR}" stroke-width="${w}" opacity="${opacity}"/>`
}

/** 画线段 */
function line(x1: number, y1: number, x2: number, y2: number, w = 1.5, opacity = 1): string {
  return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${COLOR}" stroke-width="${w}" opacity="${opacity}"/>`
}

/** 环状刻度带（占星盘刻度：等分 count 份，长刻度每 majorStep 加长） */
function tickRing(radius: number, count: number, majorStep: number, innerFrac: number, outerFrac: number, w = 1): string {
  const parts: string[] = []
  for (let i = 0; i < count; i++) {
    const deg = (i * 360) / count
    const [ix, iy] = pt(radius * innerFrac, deg)
    const [ox, oy] = pt(radius * (i % majorStep === 0 ? outerFrac : outerFrac - 0.01), deg)
    parts.push(line(ix, iy, ox, oy, w, 0.8))
  }
  return parts.join("\n    ")
}

/** 太阳符文（多角星光芒 + 中心圆） */
function sunRune(cx: number, cy: number, coreR: number, rayR: number, points = 14): string {
  const parts: string[] = []
  parts.push(circle(cx, cy, coreR, 1.5))
  // 光芒：多角星
  const star: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const deg = (i * 180) / points
    const rad = i % 2 === 0 ? rayR : coreR * 0.6
    const [x, y] = pt(rad, deg)
    star.push(`${(cx + x).toFixed(1)},${(cy + y).toFixed(1)}`)
  }
  parts.push(`<polygon points="${star.join(" ")}" fill="none" stroke="${COLOR}" stroke-width="1.5"/>`)
  return parts.join("\n    ")
}

/** 凯尔特结符文（4 交叉椭圆弧组成的圆形结扣） */
function knotRune(cx: number, cy: number, r: number): string {
  const parts: string[] = []
  // 4 个交叉椭圆（旋转 0/45/90/135°）
  for (let i = 0; i < 4; i++) {
    const rot = i * 45
    parts.push(`<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r * 0.55).toFixed(1)}" transform="rotate(${rot} ${cx.toFixed(1)} ${cy.toFixed(1)})" fill="none" stroke="${COLOR}" stroke-width="1.5"/>`)
  }
  parts.push(circle(cx, cy, r * 0.25, 1.5))
  return parts.join("\n    ")
}

/**
 * 生成单个库洛牌魔法阵（按蓝图各模块）。
 * 大阵：全要素；小阵：简化（外环+五芒星+刻度）。
 * 坐标原点 (0,0) 由调用方 translate 定位。
 */
function magicCircle(scale: number, full: boolean): string {
  // 缩放后各半径
  const r = R * scale
  const parts: string[] = []

  if (full) {
    // 1. 最外层刻度带（60 等分，每 30° 加长）
    parts.push(circle(0, 0, r, 2.5, 0.9))
    parts.push(tickRing(r, 60, 5, 0.944, 0.996, 1))
    parts.push(tickRing(r, 60, 5, 0.944, 0.93, 1.5))

    // 2. 四方位符文（正上太阳 + 3 凯尔特结，不对称——左上无）
    parts.push(sunRune(0, -0.82 * r, 0.06 * r, 0.12 * r))
    for (const deg of [72, 144, 216]) {
      const [kx, ky] = pt(0.78 * r, deg)
      parts.push(knotRune(kx, ky, 0.07 * r))
    }

    // 3. 中层放射线（20 条，每 18°）
    for (let i = 0; i < 20; i++) {
      const deg = i * 18
      const [ex, ey] = pt(0.85 * r, deg)
      parts.push(line(0, 0, ex, ey, 1, 0.6))
    }

    // 3b. 五角星外顶点骨架（连接外顶点到外环 + 相邻中点，形成三角网格）
    for (let i = 0; i < 5; i++) {
      const [vx, vy] = pt(0.6 * r, i * 72)
      parts.push(line(0, 0, vx, vy, 1, 0.5))
    }

    // 4. 核心五芒星（外顶点 0.6R / 内凹 0.25R，偏移 36°）
    const star: string[] = []
    for (let i = 0; i < 5; i++) {
      const [ox, oy] = pt(0.6 * r, i * 72)
      const [ix, iy] = pt(0.25 * r, i * 72 + 36)
      star.push(`${ox.toFixed(1)},${oy.toFixed(1)}`)
      star.push(`${ix.toFixed(1)},${iy.toFixed(1)}`)
    }
    parts.push(`<polygon points="${star.join(" ")}" fill="none" stroke="${COLOR}" stroke-width="2.5"/>`)

    // 内圈1：包裹凹槽（0.28R）
    parts.push(circle(0, 0, 0.28 * r, 1.5, 0.8))
    // 内圈2：大内环（0.6R，与外五芒星顶点相交）+ 60 刻度
    parts.push(circle(0, 0, 0.6 * r, 2, 0.85))
    parts.push(tickRing(0.6 * r, 60, 5, 0.96, 1.0, 1))

    // 5. 偏心圆（左下）
    parts.push(circle(-0.35 * r, 0.25 * r, 0.24 * r, 1.5, 0.85))
    parts.push(tickRing2(-0.35 * r, 0.25 * r, 0.24 * r, 36, 0.85, 1.0, 1))

    // 5b. 新月形刻度轨道（贝塞尔弧带 + 轨道齿痕）
    parts.push(crescentTrack(r))

    // 中心点
    parts.push(circle(0, 0, 0.02 * r, 1, 0.9))
  } else {
    // 小阵：外环 + 五芒星 + 刻度
    parts.push(circle(0, 0, r, 2, 0.85))
    parts.push(tickRing(r, 24, 6, 0.93, 1.0, 1))
    const star: string[] = []
    for (let i = 0; i < 5; i++) {
      const [ox, oy] = pt(0.6 * r, i * 72)
      const [ix, iy] = pt(0.25 * r, i * 72 + 36)
      star.push(`${ox.toFixed(1)},${oy.toFixed(1)}`)
      star.push(`${ix.toFixed(1)},${iy.toFixed(1)}`)
    }
    parts.push(`<polygon points="${star.join(" ")}" fill="none" stroke="${COLOR}" stroke-width="2"/>`)
    parts.push(circle(0, 0, 0.28 * r, 1.2, 0.8))
  }

  return parts.join("\n    ")
}

/** 偏心圆局部刻度（圆心不在原点） */
function tickRing2(cx: number, cy: number, radius: number, count: number, innerFrac: number, outerFrac: number, w: number): string {
  const parts: string[] = []
  for (let i = 0; i < count; i++) {
    const deg = (i * 360) / count
    const rad = (deg * Math.PI) / 180
    const ix = cx + radius * innerFrac * Math.sin(rad)
    const iy = cy - radius * innerFrac * Math.cos(rad)
    const ox = cx + radius * outerFrac * Math.sin(rad)
    const oy = cy - radius * outerFrac * Math.cos(rad)
    parts.push(line(ix, iy, ox, oy, w, 0.8))
  }
  return parts.join("\n    ")
}

/** 新月形刻度轨道：贝塞尔双弧闭合 + 轨道齿痕（15-20 条） */
function crescentTrack(r: number): string {
  const parts: string[] = []
  // 外弧：从右上 (0.45R,-0.45R) 弯向偏心圆（-0.35R, 0.25R）
  const startX = 0.45 * r
  const startY = -0.45 * r
  const endX = -0.35 * r
  const endY = 0.25 * r
  const ctrlX = 0.1 * r
  const ctrlY = 0.4 * r
  // 外弧
  parts.push(`<path d="M ${startX.toFixed(1)} ${startY.toFixed(1)} Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}" fill="none" stroke="${COLOR}" stroke-width="1.5"/>`)
  // 内弧（平行偏移 0.06R）
  const off = 0.06 * r
  const innerEndX = endX + off * 0.5
  const innerEndY = endY - off * 0.5
  const innerStartX = startX - off * 0.5
  const innerStartY = startY - off * 0.5
  parts.push(`<path d="M ${innerStartX.toFixed(1)} ${innerStartY.toFixed(1)} Q ${(ctrlX + off).toFixed(1)} ${(ctrlY - off * 0.5).toFixed(1)} ${innerEndX.toFixed(1)} ${innerEndY.toFixed(1)}" fill="none" stroke="${COLOR}" stroke-width="1.2" opacity="0.8"/>`)
  // 轨道齿痕（沿外弧 16 个等距点，垂直短线）
  for (let i = 0; i < 16; i++) {
    const t = i / 15
    // 二次贝塞尔插值
    const bx = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * ctrlX + t * t * endX
    const by = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * ctrlY + t * t * endY
    // 切线方向（导数）
    const dx = 2 * (1 - t) * (ctrlX - startX) + 2 * t * (endX - ctrlX)
    const dy = 2 * (1 - t) * (ctrlY - startY) + 2 * t * (endY - ctrlY)
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const h = 0.04 * r
    parts.push(line(bx - nx * h, by - ny * h, bx + nx * h, by + ny * h, 1, 0.7))
  }
  return parts.join("\n    ")
}

/** 生成完整 SVG（含发光 filter） */
function buildSvg(parts: string[], transform: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 1024 1024" preserveAspectRatio="xMidYMid slice">
  <defs>
    <filter id="sakura-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <g transform="${transform}" filter="url(#sakura-glow)">
${parts.join("\n")}
  </g>
</svg>`
}

/**
 * 生成库洛牌魔法阵背景 SVG data URI。
 * 布局：大阵（居中偏右，scale 0.55）+ 2 小阵（左下/右上点缀）。
 * 中心原点经 translate 移到 SVG 中心 (512,512)。
 */
export function buildSakuraBg(): string {
  // 大阵：居中偏右，中心约 (640, 512)，scale 0.55 → 半径 275
  const main = magicCircle(0.55, true)
  // 小阵：简化
  const small1 = magicCircle(0.24, false)
  const small2 = magicCircle(0.2, false)
  const mainG = `<g transform="translate(640 512)">\n${main}\n  </g>`
  const small1G = `<g transform="translate(150 820)">\n${small1}\n  </g>`
  const small2G = `<g transform="translate(890 140)">\n${small2}\n  </g>`
  const svg = buildSvg([mainG, small1G, small2G], "")
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
