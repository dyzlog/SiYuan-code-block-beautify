/**
 * 代码块美化插件 - 魔法阵图层池
 *
 * 按「有效魔法阵」结构分组：魔法核 / 外阵图（芒星）/ 外魔法环与势 /
 * 魔法引与魔法文 / 辅助。buildMagicSvg 按结构组装 SVG。
 */
const MAGIC_GLOW_DEFS = `
  <defs>
    <radialGradient id="cb-mg-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="currentColor" stop-opacity="0.5"/>
      <stop offset="70%" stop-color="currentColor" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="cb-mg-core" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="currentColor" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="currentColor" stop-opacity="0.25"/>
    </radialGradient>
    <!-- 深色底盘：浅色主题下为发光线条提供对比，让「光」更闪耀（浓度由 CSS 变量按主题控制） -->
    <radialGradient id="cb-mg-dark" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#000000" style="stop-opacity: var(--cb-mg-dark-core, 0.42)"/>
      <stop offset="70%" stop-color="#000000" style="stop-opacity: var(--cb-mg-dark-mid, 0.25)"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="200" cy="200" r="190" fill="url(#cb-mg-dark)"/>
  <circle cx="200" cy="200" r="188" fill="url(#cb-mg-glow)"/>`

const MAGIC_LAYERS = {
  /** 魔法核（必选）：内魔法环 + 发光核心 + 中心十字 */
  core: () => `
  <g class="cb-mg-core">
    <circle cx="200" cy="200" r="46" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 6"/>
    <circle cx="200" cy="200" r="22" fill="url(#cb-mg-core)" stroke="currentColor" stroke-width="1.5"/>
    <line x1="200" y1="186" x2="200" y2="214" stroke="currentColor" stroke-width="2"/>
    <line x1="186" y1="200" x2="214" y2="200" stroke="currentColor" stroke-width="2"/>
    <circle cx="200" cy="200" r="6" fill="currentColor"/>
  </g>`,
  /** 外阵图（芒星，至少选 1） */
  stars: [
    () => `
  <g class="cb-mg-star">
    <circle cx="200" cy="200" r="148" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="200" cy="200" r="140" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="200" cy="200" r="144" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 23"/>
    <g class="cb-mg-star-static">
      <polygon points="340,155 235,152 200,53 165,152 60,155 143,219 129,318 200,260 271,318 257,219" fill="none" stroke="currentColor" stroke-width="2"/>
    </g>
    <g class="cb-mg-star-spin">
      <polygon points="340,155 235,152 200,53 165,152 60,155 143,219 129,318 200,260 271,318 257,219" fill="none" stroke="currentColor" stroke-width="1.5" transform="rotate(36 200 200)"/>
      <line x1="200" y1="200" x2="340" y2="155" stroke="currentColor" stroke-width="1.5"/>
      <line x1="200" y1="200" x2="200" y2="53" stroke="currentColor" stroke-width="1.5"/>
      <line x1="200" y1="200" x2="60" y2="155" stroke="currentColor" stroke-width="1.5"/>
      <line x1="200" y1="200" x2="129" y2="318" stroke="currentColor" stroke-width="1.5"/>
      <line x1="200" y1="200" x2="271" y2="318" stroke="currentColor" stroke-width="1.5"/>
    </g>
  </g>`,
    () => `
  <g class="cb-mg-hexagram">
    <circle cx="200" cy="200" r="128" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <polygon points="200,72 311,236 89,236" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <polygon points="200,328 89,164 311,164" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="200" cy="200" r="6" fill="currentColor"/>
  </g>`,
    () => `
  <g class="cb-mg-pentagram">
    <circle cx="200" cy="200" r="126" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <polygon points="200,80 129.5,297.1 314.1,162.9 85.9,162.9 270.5,297.1" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="200" cy="200" r="6" fill="currentColor"/>
  </g>`,
    () => `
  <!-- 双重五芒星：两个旋转叠加 -->
  <g class="cb-mg-pentagram2">
    <circle cx="200" cy="200" r="130" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <polygon points="200,82 130.7,295.4 312.2,163.5 87.8,163.5 269.3,295.4" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <polygon points="200,82 130.7,295.4 312.2,163.5 87.8,163.5 269.3,295.4" fill="none" stroke="currentColor" stroke-width="1" transform="rotate(36 200 200)"/>
    <circle cx="200" cy="200" r="6" fill="currentColor"/>
  </g>`,
  ],
  /** 外魔法环 / 势（环类纹理，必选 1） */
  rings: [
    () => `
  <g class="cb-mg-rings">
    <circle cx="200" cy="200" r="190" fill="none" stroke="currentColor" stroke-width="3"/>
    <circle cx="200" cy="200" r="178" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="200" cy="200" r="172" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 9"/>
    <circle cx="200" cy="200" r="160" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="200" cy="200" r="140" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 4"/>
    <circle cx="200" cy="200" r="120" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="200" cy="200" r="228" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 38"/>
    <circle cx="200" cy="10" r="4" fill="currentColor"/>
    <circle cx="200" cy="10" r="4" fill="currentColor" transform="rotate(30 200 200)"/>
    <circle cx="200" cy="10" r="4" fill="currentColor" transform="rotate(60 200 200)"/>
    <circle cx="200" cy="10" r="4" fill="currentColor" transform="rotate(90 200 200)"/>
    <circle cx="200" cy="10" r="4" fill="currentColor" transform="rotate(120 200 200)"/>
    <circle cx="200" cy="10" r="4" fill="currentColor" transform="rotate(150 200 200)"/>
    <circle cx="200" cy="10" r="4" fill="currentColor" transform="rotate(180 200 200)"/>
    <circle cx="200" cy="10" r="4" fill="currentColor" transform="rotate(210 200 200)"/>
    <circle cx="200" cy="10" r="4" fill="currentColor" transform="rotate(240 200 200)"/>
    <circle cx="200" cy="10" r="4" fill="currentColor" transform="rotate(270 200 200)"/>
    <circle cx="200" cy="10" r="4" fill="currentColor" transform="rotate(300 200 200)"/>
    <circle cx="200" cy="10" r="4" fill="currentColor" transform="rotate(330 200 200)"/>
  </g>`,
    () => `
  <g transform="translate(338 200)">
    <g class="cb-mg-sun">
      <circle cx="0" cy="0" r="16" fill="none" stroke="currentColor" stroke-width="2"/>
      <polygon points="65,0 11,-11 11,11" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <polygon points="65,0 11,-11 11,11" fill="none" stroke="currentColor" stroke-width="1.5" transform="rotate(90)"/>
      <polygon points="65,0 11,-11 11,11" fill="none" stroke="currentColor" stroke-width="1.5" transform="rotate(180)"/>
      <polygon points="65,0 11,-11 11,11" fill="none" stroke="currentColor" stroke-width="1.5" transform="rotate(270)"/>
      <line x1="24" y1="-24" x2="44" y2="-44" stroke="currentColor" stroke-width="1.5"/>
      <line x1="-24" y1="-24" x2="-44" y2="-44" stroke="currentColor" stroke-width="1.5"/>
      <line x1="-24" y1="24" x2="-44" y2="44" stroke="currentColor" stroke-width="1.5"/>
      <line x1="24" y1="24" x2="44" y2="44" stroke="currentColor" stroke-width="1.5"/>
    </g>
  </g>
  <g transform="translate(76 200)">
    <g class="cb-mg-moon">
      <circle cx="0" cy="0" r="40" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <path d="M 0 -48 A 48 48 0 1 0 0 48 A 36 36 0 1 1 0 -48 Z" fill="none" stroke="currentColor" stroke-width="2"/>
    </g>
  </g>`,
  ],
  /** 魔法引 / 祈祷文 / 外魔法文（符文文字环） */
  runes: [
    () => `
  <g class="cb-mg-constellation" font-family="'Segoe UI Symbol','Arial Unicode MS',sans-serif" font-size="15" text-anchor="middle" fill="currentColor">
    <text x="358" y="208">♈</text><text x="337" y="124">♉</text><text x="279" y="66">♊</text><text x="200" y="46">♋</text><text x="121" y="66">♌</text><text x="63" y="124">♍</text><text x="42" y="208">♎</text><text x="63" y="282">♏</text><text x="121" y="340">♐</text><text x="200" y="360">♑</text><text x="279" y="340">♒</text><text x="337" y="282">♓</text>
  </g>`,
    () => `
  <g class="cb-mg-suits" font-family="'Segoe UI Symbol','Arial Unicode MS',sans-serif" font-size="20" text-anchor="middle" fill="currentColor">
    <text x="200" y="104">♠</text>
    <text x="304" y="205">♥</text>
    <text x="200" y="306">♣</text>
    <text x="96" y="205">♦</text>
    <circle cx="200" cy="90" r="18" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="310" cy="200" r="18" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="200" cy="310" r="18" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="90" cy="200" r="18" fill="none" stroke="currentColor" stroke-width="1.5"/>
  </g>`,
    () => `
  <g class="cb-mg-tools">
    <circle cx="200" cy="200" r="105" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 6"/>
    <g transform="translate(200 95)">
      <ellipse cx="0" cy="-14" rx="13" ry="4" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <path d="M -11 -12 Q -11 8 -5 13 L 5 13 Q 11 8 11 -12" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <line x1="-7" y1="17" x2="7" y2="17" stroke="currentColor" stroke-width="2"/>
      <path d="M 11 -8 Q 19 -2 15 9" fill="none" stroke="currentColor" stroke-width="1.5"/>
    </g>
    <g transform="translate(305 200)">
      <line x1="0" y1="-32" x2="0" y2="32" stroke="currentColor" stroke-width="3"/>
      <circle cx="0" cy="-36" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <line x1="-4" y1="-28" x2="4" y2="-24" stroke="currentColor" stroke-width="1.5"/>
      <line x1="-4" y1="-24" x2="4" y2="-28" stroke="currentColor" stroke-width="1.5"/>
    </g>
    <g transform="translate(200 305)">
      <polygon points="0,-34 5,-6 -5,-6" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <line x1="-9" y1="-6" x2="9" y2="-6" stroke="currentColor" stroke-width="2"/>
      <line x1="0" y1="-4" x2="0" y2="16" stroke="currentColor" stroke-width="2.5"/>
      <circle cx="0" cy="21" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/>
    </g>
    <g transform="translate(95 200)">
      <circle cx="0" cy="0" r="22" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <polygon points="0,-15 -8.8,-12.1 14.3,4.6 -14.3,4.6 8.8,-12.1" fill="none" stroke="currentColor" stroke-width="1.5"/>
    </g>
  </g>`,
    () => `
  <g class="cb-mg-dirs" font-family="'Segoe UI Symbol','Segoe UI Historic',sans-serif" font-size="16" text-anchor="middle" fill="currentColor">
    <circle cx="200" cy="45" r="14" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="355" cy="200" r="14" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="200" cy="355" r="14" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="45" cy="200" r="14" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <text x="200" y="49">🜃</text><text x="355" y="204">🜂</text><text x="200" y="359">🜄</text><text x="45" y="204">🜁</text>
  </g>`,
    () => `
  <g class="cb-mg-wheel">
    <circle cx="200" cy="200" r="115" fill="none" stroke="currentColor" stroke-width="2"/>
    <circle cx="200" cy="200" r="95" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="200" cy="200" r="28" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="200" cy="200" r="6" fill="currentColor"/>
    <line x1="200" y1="85" x2="200" y2="115" stroke="currentColor" stroke-width="1.5"/>
    <line x1="200" y1="85" x2="200" y2="115" stroke="currentColor" stroke-width="1.5" transform="rotate(45 200 200)"/>
    <line x1="200" y1="85" x2="200" y2="115" stroke="currentColor" stroke-width="1.5" transform="rotate(90 200 200)"/>
    <line x1="200" y1="85" x2="200" y2="115" stroke="currentColor" stroke-width="1.5" transform="rotate(135 200 200)"/>
    <line x1="200" y1="85" x2="200" y2="115" stroke="currentColor" stroke-width="1.5" transform="rotate(180 200 200)"/>
    <line x1="200" y1="85" x2="200" y2="115" stroke="currentColor" stroke-width="1.5" transform="rotate(225 200 200)"/>
    <line x1="200" y1="85" x2="200" y2="115" stroke="currentColor" stroke-width="1.5" transform="rotate(270 200 200)"/>
    <line x1="200" y1="85" x2="200" y2="115" stroke="currentColor" stroke-width="1.5" transform="rotate(315 200 200)"/>
  </g>`,
    () => `
  <!-- 北欧符文环（Elder Futhark） -->
  <g class="cb-mg-runes-ring" font-family="'Segoe UI Historic','Segoe UI Symbol',sans-serif" font-size="16" text-anchor="middle" fill="currentColor">
    <circle cx="200" cy="200" r="140" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 6"/>
    <text x="330" y="205">ᚠ</text>
    <text x="292" y="113">ᚢ</text>
    <text x="200" y="75">ᚦ</text>
    <text x="108" y="113">ᚨ</text>
    <text x="70" y="205">ᚱ</text>
    <text x="108" y="297">ᚲ</text>
    <text x="200" y="335">ᚷ</text>
    <text x="292" y="297">ᚹ</text>
  </g>`,
    () => `
  <!-- 行星符号环（☿♀♁♂♃♄♅♆♇） -->
  <g class="cb-mg-planets" font-family="'Segoe UI Symbol',sans-serif" font-size="15" text-anchor="middle" fill="currentColor">
    <circle cx="200" cy="200" r="115" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 7"/>
    <text x="310" y="205">☿</text>
    <text x="284" y="134">♀</text>
    <text x="219" y="96">♁</text>
    <text x="145" y="109">♂</text>
    <text x="96" y="166">♃</text>
    <text x="96" y="242">♄</text>
    <text x="145" y="299">♅</text>
    <text x="219" y="312">♆</text>
    <text x="284" y="275">♇</text>
  </g>`,
    () => `
  <!-- 炼金符号环（蚂蚁/四元素/盐硫汞等） -->
  <g class="cb-mg-alchemy" font-family="'Segoe UI Symbol',sans-serif" font-size="15" text-anchor="middle" fill="currentColor">
    <circle cx="200" cy="200" r="120" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="1 8"/>
    <text x="320" y="205">🜀</text>
    <text x="297" y="129">🜁</text>
    <text x="236" y="90">🜂</text>
    <text x="164" y="90">🜃</text>
    <text x="103" y="129">🜄</text>
    <text x="80" y="205">🜍</text>
    <text x="103" y="281">🜔</text>
    <text x="164" y="320">🜚</text>
    <text x="236" y="320">🜞</text>
    <text x="297" y="281">🜟</text>
  </g>`,
  ],
  /** 辅助魔法阵（可选） */
  extras: [
    () => `
  <g class="cb-mg-square">
    <polygon points="200,48 352,200 200,352 48,200" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <polygon points="200,48 352,200 200,352 48,200" fill="none" stroke="currentColor" stroke-width="1.5" transform="rotate(30 200 200)"/>
    <polygon points="200,48 352,200 200,352 48,200" fill="none" stroke="currentColor" stroke-width="1.5" transform="rotate(60 200 200)"/>
    <polygon points="200,48 352,200 200,352 48,200" fill="none" stroke="currentColor" stroke-width="1.5" transform="rotate(90 200 200)"/>
    <line x1="200" y1="60" x2="200" y2="120" stroke="currentColor" stroke-width="1.5"/>
    <line x1="200" y1="60" x2="200" y2="120" stroke="currentColor" stroke-width="1.5" transform="rotate(30 200 200)"/>
    <line x1="200" y1="60" x2="200" y2="120" stroke="currentColor" stroke-width="1.5" transform="rotate(60 200 200)"/>
    <line x1="200" y1="60" x2="200" y2="120" stroke="currentColor" stroke-width="1.5" transform="rotate(90 200 200)"/>
    <line x1="200" y1="60" x2="200" y2="120" stroke="currentColor" stroke-width="1.5" transform="rotate(120 200 200)"/>
    <line x1="200" y1="60" x2="200" y2="120" stroke="currentColor" stroke-width="1.5" transform="rotate(150 200 200)"/>
    <line x1="200" y1="60" x2="200" y2="120" stroke="currentColor" stroke-width="1.5" transform="rotate(180 200 200)"/>
    <line x1="200" y1="60" x2="200" y2="120" stroke="currentColor" stroke-width="1.5" transform="rotate(210 200 200)"/>
    <line x1="200" y1="60" x2="200" y2="120" stroke="currentColor" stroke-width="1.5" transform="rotate(240 200 200)"/>
    <line x1="200" y1="60" x2="200" y2="120" stroke="currentColor" stroke-width="1.5" transform="rotate(270 200 200)"/>
    <line x1="200" y1="60" x2="200" y2="120" stroke="currentColor" stroke-width="1.5" transform="rotate(300 200 200)"/>
    <line x1="200" y1="60" x2="200" y2="120" stroke="currentColor" stroke-width="1.5" transform="rotate(330 200 200)"/>
  </g>`,
  ],
}


export function buildMagicSvg(layerCount: number): string {
  const pick = (arr: (() => string)[]) => arr[Math.floor(Math.random() * arr.length)]
  const parts: string[] = []
  // 外层：外魔法环 / 势（必选 1）
  parts.push(pick(MAGIC_LAYERS.rings)())
  // 魔法引 / 祈祷文 / 外魔法文（0-1 个）
  if (Math.random() < 0.8) {
    parts.push(pick(MAGIC_LAYERS.runes)())
  }
  // 外阵图（芒星，必选 1；层数充裕时可再叠 1 个）
  parts.push(pick(MAGIC_LAYERS.stars)())
  if (layerCount >= 5 && Math.random() < 0.6) {
    parts.push(pick(MAGIC_LAYERS.stars)())
  }
  // 辅助魔法阵（可选）
  if (layerCount >= 4 && Math.random() < 0.7) {
    parts.push(pick(MAGIC_LAYERS.extras)())
  }
  // 魔法核（必选，最内层）
  parts.push(MAGIC_LAYERS.core())
  return `<svg class="cb-magic-circle-svg" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">${MAGIC_GLOW_DEFS}${parts.join("")}</svg>`
}

