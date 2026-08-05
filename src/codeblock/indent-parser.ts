/**
 * 缩进解析纯函数（无 DOM 依赖，可单元测试）。
 *
 * 输入代码文本 → 每行缩进空格数 → 缩进宽度 → 竖线段。
 * 供缩进竖线渲染（indent-guides.ts）使用；独立成纯函数模块以便回归测试锁住行为。
 */

/** 缩进级别换算：tab 视为 4 空格 */
export const TAB_SIZE = 4

export interface GuideSegment {
  /** 缩进层级（1 基） */
  level: number
  /** 段起始行（0 基） */
  start: number
  /** 段结束行（0 基） */
  end: number
}

/**
 * 计算每行的缩进空格数（tab 按 4 空格展开）。
 *  - 空行/注释行继承前一行缩进 → 竖线连续穿过（VSCode 行为）
 */
export function computeIndentLevels(text: string): number[] {
  const indents: number[] = []
  let lastIndent = 0
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
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
 * 自动检测代码的缩进宽度（频率统计：取出现 ≥2 次的最常见非零缩进，忽略偶发缩进；否则回退最小非零）
 */
export function detectIndentWidth(indents: number[]): number {
  const freq = new Map<number, number>()
  for (const n of indents) {
    if (n > 0) {
      freq.set(n, (freq.get(n) ?? 0) + 1)
    }
  }
  let best = 0
  let bestCount = 0
  for (const [n, count] of freq) {
    if (count > bestCount) {
      best = n
      bestCount = count
    }
  }
  if (bestCount >= 2) {
    return best
  }
  // 无重复缩进（如单块单层缩进）：退回最小非零，兼容 2/4/8 空格等习惯
  let min = Number.MAX_SAFE_INTEGER
  for (const n of freq.keys()) {
    if (n < min) {
      min = n
    }
  }
  return min === Number.MAX_SAFE_INTEGER ? TAB_SIZE : min
}

/**
 * 缩进层级栈：计算每个缩进层级的竖线段。
 * 规则：
 * - 每级线只在"缩进达到该层级"的连续行内绘制（缩进不足的行断开，禁止跨块连线）
 * - 空行已由 computeIndentLevels 继承前一行缩进，自然属于对应段
 * - 输出 [{ level, start, end }]，行号 0 基
 */
export function buildGuideSegments(indents: number[], indentWidth: number): GuideSegment[] {
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
