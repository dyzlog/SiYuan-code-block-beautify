/**
 * 代码折叠区域的语法启发式解析
 *
 * 支持两类语法结构：
 * - 花括号块（JS/TS/Java/C/C++/Go 等）：`{` 到匹配 `}` 的区间
 * - 缩进块（Python 等）：行尾 `:` 开始的缩进区间
 *
 * 语言判定与括号统计都会剥离注释与字符串字面量内容，
 * 避免 f-string/模板字符串里的 `{}` 或注释里的括号干扰判断。
 *
 * 行号为 0 基（对应代码文本 split("\n") 的索引）。
 */
export interface FoldRegion {
  /** 可折叠区域的起始行（声明行），0 基 */
  start: number
  /** 区域的最后一行（含闭合符号），0 基 */
  end: number
}

/** 去掉注释与字符串字面量内容，仅保留代码结构（引号内空格化，注释截断） */
function stripStructural(line: string): string {
  let out = ""
  let quote: string | null = null
  let i = 0
  while (i < line.length) {
    const ch = line[i]
    if (quote) {
      if (ch === "\\") {
        i += 2
        continue
      }
      if (ch === quote) {
        quote = null
      }
      i++
      continue
    }
    // 行注释（结构外）
    if (ch === "#" || (ch === "/" && line[i + 1] === "/")) {
      break
    }
    if (ch === "'" || ch === "\"" || ch === "`") {
      quote = ch
      out += " "
      i++
      continue
    }
    out += ch
    i++
  }
  return out
}

function countChar(s: string, ch: string): number {
  let n = 0
  for (const c of s) {
    if (c === ch) {
      n++
    }
  }
  return n
}

/** 检测花括号块起始行：行内有 `{` 且不以 `}` 开头（排除纯闭合行） */
function isBraceStart(line: string): boolean {
  return line.includes("{") && !line.trimStart().startsWith("}")
}

/** Python 等缩进块：行尾冒号，排除 URL / 命名空间等误判 */
function isIndentStart(line: string): boolean {
  return /:\s*$/.test(line) && !/^\s*(?:https?:|::)/.test(line)
}

/**
 * 花括号语言（Pass A）：代码块语言标签命中时强制使用花括号解析
 */
const BRACE_LANGS = new Set([
  "javascript",
  "js",
  "jsx",
  "typescript",
  "ts",
  "tsx",
  "java",
  "c",
  "cpp",
  "c++",
  "csharp",
  "cs",
  "go",
  "rust",
  "rs",
  "php",
  "kotlin",
  "kt",
  "swift",
  "dart",
  "json",
  "css",
  "less",
  "scss",
  "sass",
  "objectivec",
  "objc",
  "groovy",
  "scala",
])

/**
 * 缩进语言（Pass B）：命中时强制使用缩进解析
 */
const INDENT_LANGS = new Set([
  "python",
  "py",
  "yaml",
  "yml",
  "makefile",
  "haskell",
  "hs",
  "cobol",
  "nim",
])

/**
 * 判定是否为花括号语言：存在块状花括号特征（行尾 `{`、行首 `{`），
 * 排除 Python 字典/集合字面量、字符串内容等非块状花括号
 */
function hasBraceBlocks(lines: string[]): boolean {
  for (const line of lines) {
    const s = stripStructural(line)
    if (/\{\s*$/.test(s) || /^\s*\{/.test(s)) {
      return true
    }
  }
  return false
}

/** 花括号匹配：按 `{`/`}` 深度栈闭合区域 */
function findBraceRegions(lines: string[]): FoldRegion[] {
  const regions: FoldRegion[] = []
  const stack: { start: number, depth: number }[] = []
  let depth = 0
  for (let i = 0; i < lines.length; i++) {
    const part = stripStructural(lines[i])
    const opens = countChar(part, "{")
    const closes = countChar(part, "}")
    if (opens > 0 && isBraceStart(part)) {
      stack.push({
        start: i,
        depth: depth + opens,
      })
    }
    depth += opens - closes
    if (depth < 0) {
      depth = 0
    }
    if (closes > 0) {
      while (stack.length > 0 && depth < stack[stack.length - 1].depth) {
        const b = stack.pop()!
        if (i - b.start >= 2) {
          regions.push({
            start: b.start,
            end: i,
          })
        }
      }
    }
  }
  return regions
}

/**
 * 缩进匹配：按缩进层级栈闭合区域（Python/YAML 等）
 */
function findIndentRegions(lines: string[]): FoldRegion[] {
  const regions: FoldRegion[] = []
  const stack: { indent: number, start: number }[] = []
  const popTo = (indent: number, currentLine: number) => {
    while (stack.length > 0 && indent <= stack[stack.length - 1].indent) {
      const b = stack.pop()!
      if (currentLine - 1 - b.start >= 1) {
        regions.push({
          start: b.start,
          end: currentLine - 1,
        })
      }
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const trimmed = raw.trim()
    if (!trimmed) {
      continue
    }
    const part = stripStructural(raw)
    const indent = raw.length - raw.trimStart().length
    // 先闭合同级或更深缩进的块（def/class/for/if 等嵌套场景）
    popTo(indent, i)
    if (isIndentStart(part)) {
      stack.push({
        indent,
        start: i,
      })
    }
  }
  // 循环结束：闭合剩余未闭合的块（块延伸到文件末尾，如文件结尾的 except/for 块）
  popTo(-1, lines.length)
  return regions
}

/**
 * 查找代码内可折叠区域（含起始行，不含结束行）。
 * @param code 代码文本
 * @param language 代码块语言（思源语言标签），命中已知语言时按语言选择解析策略；
 *                 未知语言回退到启发式判定
 */
export function findFoldRegions(code: string, language = ""): FoldRegion[] {
  const lines = code.split("\n")
  const lang = language.trim().toLowerCase()
  const hasBrace = BRACE_LANGS.has(lang)
    || (!INDENT_LANGS.has(lang) && hasBraceBlocks(lines))

  const regions = hasBrace ? findBraceRegions(lines) : findIndentRegions(lines)
  return regions.sort((a, b) => a.start - b.start)
}
