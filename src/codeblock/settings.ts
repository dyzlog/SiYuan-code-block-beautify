/**
 * 代码块美化插件 - 设置模型
 */
export const STORAGE_NAME = "config"

export interface CodeBlockSettings {
  /** 总开关 */
  enabled: boolean
  /** 圆角 (px)，0-24 */
  borderRadius: number
  /** 边框宽度 (px)，0 = 无边框 */
  borderWidth: number
  /** 边框颜色（CSS 颜色值，空 = 跟随主题） */
  borderColor: string
  /** 代码块背景颜色（CSS 颜色值，空 = 跟随主题） */
  backgroundColor: string
  /** 代码块背景图片 URL（空 = 无，图片会自动虚化） */
  backgroundImage: string
  /** 背景主题（"" = 无，其余 = CSS 纹理） */
  backgroundTheme: string
  /** 代码字体族（空 = 跟随主题） */
  codeFontFamily: string
  /** 背景图片虚化强度 (px) */
  backgroundBlur: number
  /** 背景遮罩不透明度（0-100，保证代码可读） */
  backgroundMaskOpacity: number
  /** 阴影大小 (px)，正数 = 下投影（上凸），负数 = 内嵌（下凹），0 = 无 */
  shadowSize: number
  /** 当前行高亮（跟随输入光标） */
  currentLineHighlight: boolean
  /** 当前行高亮颜色（空 = 跟随主题默认半透明） */
  currentLineColor: string
  /** 代码统计角标（底部显示行数/字符数） */
  codeStats: boolean
  /** 思源原生行号开关（同步 window.siyuan.config.editor.codeSyntaxHighlightLineNum） */
  showLineNumber: boolean
  /** 语法高亮主题（空 = 跟随思源设置，否则覆盖为指定 hljs 主题） */
  highlightTheme: string
  /** 长代码折叠（超出阈值行数显示「只显示固定行」按钮） */
  longCodeFold: boolean
  /** 长代码折叠的固定行数阈值 */
  longCodeThreshold: number
  /** 顶部栏主题风格开关 */
  themeStyleEnabled: boolean
  /** 顶部栏主题风格（"" = 无，"mac" = Mac 风格圆点） */
  themeStyle: string
}

export const DEFAULT_SETTINGS: CodeBlockSettings = {
  enabled: true,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: "",
  backgroundColor: "",
  backgroundImage: "",
  backgroundTheme: "",
  codeFontFamily: "",
  backgroundBlur: 16,
  backgroundMaskOpacity: 78,
  shadowSize: 8,
  currentLineHighlight: true,
  currentLineColor: "",
  codeStats: true,
  showLineNumber: true,
  highlightTheme: "",
  longCodeFold: true,
  longCodeThreshold: 20,
  themeStyleEnabled: true,
  themeStyle: "mac",
}

/** 将已保存的数据与默认值合并，兼容缺失字段与旧版本布尔开关数据 */
export function mergeSettings(raw: unknown): CodeBlockSettings {
  const base: CodeBlockSettings = { ...DEFAULT_SETTINGS }
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>
    for (const key of Object.keys(base) as (keyof CodeBlockSettings)[]) {
      const v = r[key]
      if (v !== undefined && typeof v === typeof base[key]) {
        (base as unknown as Record<string, unknown>)[key] = v
      }
    }
    // 旧版本数据迁移：border/shadow 布尔开关 → 数值
    if (typeof r.border === "boolean" && r.borderWidth === undefined) {
      base.borderWidth = r.border ? 1 : 0
    }
    if (typeof r.shadow === "boolean" && r.shadowSize === undefined) {
      base.shadowSize = r.shadow ? 8 : 0
    }
  }
  return base
}

/** 将设置写入 CSS 变量，一处生效，全部代码块共享 */
export function applySettingsVars(s: CodeBlockSettings) {
  const root = document.documentElement
  root.style.setProperty("--cb-radius", `${s.borderRadius}px`)
  root.style.setProperty("--cb-border-width", `${s.borderWidth}px`)
  root.style.setProperty("--cb-border-color", s.borderColor)
  root.style.setProperty("--cb-bg-color", s.backgroundColor)
  root.style.setProperty("--cb-bg-blur", `${s.backgroundBlur}px`)
  root.style.setProperty("--cb-bg-mask-opacity", `${s.backgroundMaskOpacity}%`)
  root.style.setProperty("--cb-current-line-color", s.currentLineColor)
  // 代码字体（空值时回退跟随主题）
  root.style.setProperty("--cb-code-font-family", s.codeFontFamily)
  // 负数：内嵌阴影（顶部深内嵌 + 底部浅内嵌，凹陷感更明显）
  const shadow = s.shadowSize === 0
    ? "none"
    : s.shadowSize > 0
      ? `0 2px ${s.shadowSize}px rgba(0, 0, 0, 0.15)`
      : `inset 0 ${-s.shadowSize}px ${-s.shadowSize * 2}px rgba(0, 0, 0, 0.3), inset 0 ${-Math.max(2, -s.shadowSize / 2)}px ${-s.shadowSize}px rgba(0, 0, 0, 0.1)`
  root.style.setProperty("--cb-shadow", shadow)
}
