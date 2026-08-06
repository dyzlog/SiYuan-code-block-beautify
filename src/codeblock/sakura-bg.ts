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

/** 环状刻度带（占星盘刻度：每 6° 一根，长短交替——每 30° 长刻度加长） */
function tickRing(radius: number, innerFrac: number, outerFrac: number): string {
  const parts: string[] = []
  // 每 6° 一根，共 60 根；每 30°（第 5 根）为长刻度
  for (let i = 0; i < 360; i += 6) {
    const isMain = i % 30 === 0
    // 长刻度外延 outerFrac，短刻度外延 outerFrac-0.03（长短交替）
    const [ix, iy] = pt(radius * innerFrac, i)
    const [ox, oy] = pt(radius * (isMain ? outerFrac : outerFrac - 0.03), i)
    parts.push(line(ix, iy, ox, oy, isMain ? 1.5 : 1, isMain ? 0.9 : 0.7))
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

/** 凯尔特结符文（多层交叉椭圆交织，营造精妙符号感） */
function knotRune(cx: number, cy: number, r: number): string {
  const parts: string[] = []
  // 外圈
  parts.push(circle(cx, cy, r, 1.5))
  // 6 个交叉椭圆（每 30° 旋转，形成密集交织结）
  for (let i = 0; i < 6; i++) {
    const rot = i * 30
    parts.push(`<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(r * 0.85).toFixed(1)}" ry="${(r * 0.5).toFixed(1)}" transform="rotate(${rot} ${cx.toFixed(1)} ${cy.toFixed(1)})" fill="none" stroke="${COLOR}" stroke-width="1.2"/>`)
  }
  // 内圈 + 中心点
  parts.push(circle(cx, cy, r * 0.35, 1.2, 0.8))
  parts.push(circle(cx, cy, r * 0.12, 1, 0.9))
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
    // 图层顺序：①外环刻度 → ②符文 → ③中层三角网 → ④大内环 → ⑤五芒星 → ⑥偏心圆轨道
    // 1. 最外层刻度带（60 根，每 6°，长短交替）
    parts.push(circle(0, 0, r, 2.5, 0.9))
    parts.push(tickRing(r, 0.96, 1.0))

    // 2. 四方位符文（正上太阳 + 3 凯尔特结，不对称——左上无）
    parts.push(sunRune(0, -0.82 * r, 0.06 * r, 0.12 * r))
    for (const deg of [72, 144, 216]) {
      const [kx, ky] = pt(0.78 * r, deg)
      parts.push(knotRune(kx, ky, 0.07 * r))
    }

    // 3. 中层经纬网格（真正的网格系统）：放射线(18°步进) + 多层纬线环 + 斜向交叉
    //    放射线：0.6R → 0.85R（20 条，每 18°）
    const rayAngles: number[] = []
    for (let i = 0; i < 20; i++) {
      rayAngles.push(i * 18)
    }
    for (const deg of rayAngles) {
      const [ix, iy] = pt(0.6 * r, deg)
      const [ox, oy] = pt(0.85 * r, deg)
      parts.push(line(ix, iy, ox, oy, 1, 0.6))
    }
    // 纬线环：多条同心圆（0.65R / 0.72R / 0.79R）——经纬交叉的水平纬线
    for (const frac of [0.65, 0.72, 0.79]) {
      parts.push(circle(0, 0, frac * r, 0.8, 0.4))
    }
    // 斜向交叉线：相邻放射线之间的"之"字连接（形成三角网格）
    for (let i = 0; i < 20; i++) {
      const degA = i * 18
      const degB = (i + 1) * 18
      // 内环(0.65R) A点 → 外环(0.79R) B点，交叉
      const [aix, aiy] = pt(0.65 * r, degA)
      const [bix, biy] = pt(0.79 * r, degB)
      parts.push(line(aix, aiy, bix, biy, 0.8, 0.4))
      const [aox, aoy] = pt(0.79 * r, degA)
      const [box, boy] = pt(0.65 * r, degB)
      parts.push(line(aox, aoy, box, boy, 0.8, 0.4))
    }
    // 外网格：0.79R → 0.85R 之间的短斜线（最外圈网格收口）
    for (let i = 0; i < 20; i++) {
      const degA = i * 18
      const degB = (i + 1) * 18
      const [aix, aiy] = pt(0.79 * r, degA)
      const [bix, biy] = pt(0.85 * r, degB)
      parts.push(line(aix, aiy, bix, biy, 0.8, 0.35))
    }
    // 五芒星外顶点(0.6R)到放射线内端(0.6R)的星形连接（五芒星网格收口）
    for (let i = 0; i < 5; i++) {
      const deg = i * 72
      const [vx, vy] = pt(0.6 * r, deg)
      const [mx, my] = pt(0.6 * r, deg + 18)
      parts.push(line(vx, vy, mx, my, 0.8, 0.4))
    }

    // 4. 大内环（0.6R，与五芒星顶点相交）+ 细密刻度带（更细但清晰）
    parts.push(circle(0, 0, 0.6 * r, 2, 0.85))
    parts.push(tickRing(0.6 * r, 0.955, 1.0))

    // 5. 核心五芒星（后画，不被放射线割断）
    const star: string[] = []
    for (let i = 0; i < 5; i++) {
      const [ox, oy] = pt(0.6 * r, i * 72)
      const [ix, iy] = pt(0.25 * r, i * 72 + 36)
      star.push(`${ox.toFixed(1)},${oy.toFixed(1)}`)
      star.push(`${ix.toFixed(1)},${iy.toFixed(1)}`)
    }
    parts.push(`<polygon points="${star.join(" ")}" fill="none" stroke="${COLOR}" stroke-width="2.5"/>`)

    // 内圈1：包裹凹槽（0.28R）+ 更细同心圆（0.22R）+ 十字基准线（罗盘感）
    parts.push(circle(0, 0, 0.28 * r, 1.5, 0.8))
    parts.push(circle(0, 0, 0.22 * r, 0.8, 0.5))
    parts.push(circle(0, 0, 0.16 * r, 0.8, 0.45))
    // 十字交叉基准线（罗盘基准）
    for (const deg of [0, 90]) {
      const [ex, ey] = pt(0.28 * r, deg)
      const [wx, wy] = pt(0.28 * r, deg + 180)
      parts.push(line(ex, ey, wx, wy, 0.8, 0.4))
    }
    // 对角基准线（45°/135°）
    for (const deg of [45, 135]) {
      const [ex, ey] = pt(0.28 * r, deg)
      const [wx, wy] = pt(0.28 * r, deg + 180)
      parts.push(line(ex, ey, wx, wy, 0.6, 0.3))
    }

    // 6. 偏心圆（左下）+ 内部嵌套圆环结（刻度在圆外侧，内部只留花纹）
    const exCx = -0.35 * r
    const exCy = 0.25 * r
    parts.push(circle(exCx, exCy, 0.24 * r, 1.5, 0.85))
    // 刻度画在圆外侧（innerFrac>1，紧贴圆外缘）
    parts.push(tickRing2(exCx, exCy, 0.24 * r, 36, 1.0, 1.08, 1))
    // 内部只保留花纹：小凯尔特结 + 内环（包裹纹章）
    parts.push(circle(exCx, exCy, 0.15 * r, 1, 0.7))
    parts.push(knotRune(exCx, exCy, 0.12 * r))

    // 7. 新月形刻度轨道（Arc 弧线带 + 轨道齿痕）
    parts.push(crescentTrack(r))

    // 中心实心点
    parts.push(circle(0, 0, 0.015 * r, 1, 0.9))
    parts.push(`<circle cx="0" cy="0" r="${(0.005 * r).toFixed(2)}" fill="${COLOR}"/>`)
  } else {
    // 小阵：外环 + 五芒星 + 刻度
    parts.push(circle(0, 0, r, 2, 0.85))
    parts.push(tickRing(r, 0.93, 1.0))
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

/** 新月形刻度轨道：双 Arc 弧带（右上 → 右下大弧 → 左下偏心圆）+ 轨道齿痕 */
function crescentTrack(r: number): string {
  const parts: string[] = []
  // 起点：右上 (0.5R, -0.45R)；终点：左下偏心圆上侧 (-0.35R, 0.25R)
  const sx = 0.5 * r
  const sy = -0.45 * r
  const ex = -0.35 * r
  const ey = 0.25 * r
  // 外弧半径（大弧，向右下弯）
  const arcR = 0.85 * r
  // 外弧：A rx ry x-rot large-arc sweep x y
  parts.push(`<path d="M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${arcR.toFixed(1)} ${arcR.toFixed(1)} 0 1 1 ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="${COLOR}" stroke-width="1.5"/>`)
  // 内弧（偏移 0.06R，半径略小）
  const off = 0.06 * r
  const innerR = arcR - off * 0.6
  const innerSx = sx - off * 0.5
  const innerSy = sy + off * 0.5
  const innerEx = ex + off * 0.5
  const innerEy = ey - off * 0.5
  parts.push(`<path d="M ${innerSx.toFixed(1)} ${innerSy.toFixed(1)} A ${innerR.toFixed(1)} ${innerR.toFixed(1)} 0 1 1 ${innerEx.toFixed(1)} ${innerEy.toFixed(1)}" fill="none" stroke="${COLOR}" stroke-width="1.2" opacity="0.8"/>`)
  // 轨道齿痕：沿外弧 20 个等距点，垂直短线
  for (let i = 0; i < 20; i++) {
    const t = i / 19
    // 圆弧参数插值：圆心在起点/终点中垂线上
    const midX = (sx + ex) / 2
    const midY = (sy + ey) / 2
    const dx = ex - sx
    const dy = ey - sy
    const dist = Math.hypot(dx, dy) || 1
    // 圆心（弧在右侧，圆心在中垂线左侧）
    const h = Math.sqrt(Math.max(0, arcR * arcR - (dist / 2) * (dist / 2)))
    const cx = midX - h * (-dy / dist)
    const cy = midY - h * (dx / dist)
    const startAngle = Math.atan2(sy - cy, sx - cx)
    const endAngle = Math.atan2(ey - cy, ex - cx)
    const angle = startAngle + (endAngle - startAngle) * t
    const bx = cx + arcR * Math.cos(angle)
    const by = cy + arcR * Math.sin(angle)
    // 法线方向（径向）
    const nx = (bx - cx) / arcR
    const ny = (by - cy) / arcR
    const hl = 0.035 * r
    parts.push(line(bx - nx * hl, by - ny * hl, bx + nx * hl, by + ny * hl, 1, 0.7))
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
