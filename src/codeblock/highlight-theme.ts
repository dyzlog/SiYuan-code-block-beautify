/**
 * 语法高亮主题：复制思源的「代码块高亮主题」功能。
 *
 * 思源通过替换 `<link id="protyleHljsStyle">` 加载 hljs 主题 CSS
 * （内置在 /stage/protyle/js/highlight.js/styles/ 下，与 hljs 官方主题一致）。
 * 本模块动态注入一个插件自己的主题 link，样式与思源主题同为 `.hljs-keyword`
 * 等单 class 选择器，后加载的 link 会覆盖思源默认主题，无需改动思源配置。
 */

const LINK_ID = "cb-hljs-theme"

/** 常用 hljs 主题（值即主题文件名，路径由思源内置目录提供） */
export const HIGHLIGHT_THEMES = [
  "github",
  "github-dark",
  "xcode",
  "atom-one-dark",
  "atom-one-light",
  "monokai",
  "nord",
  "obsidian",
  "vs",
  "vs2015",
  "idea",
  "dracula",
] as const

/** 从思源现有主题 link 推断 hljs 主题 CSS 目录（兼容本地 /stage 与 CDN 部署） */
function getHljsStylesDir(): string {
  const siyuanLink = document.getElementById("protyleHljsStyle") as HTMLLinkElement | null
  if (siyuanLink?.href) {
    const idx = siyuanLink.href.lastIndexOf("/")
    if (idx > 0) {
      return siyuanLink.href.slice(0, idx + 1)
    }
  }
  return "/stage/protyle/js/highlight.js/styles/"
}

/**
 * 应用语法高亮主题。
 * @param theme 主题名（如 "github"），空字符串 = 跟随思源设置（移除插件覆盖）
 */
export function applyHighlightTheme(theme: string) {
  const existing = document.getElementById(LINK_ID) as HTMLLinkElement | null
  if (!theme) {
    existing?.remove()
    return
  }
  const href = `${getHljsStylesDir()}${theme}.min.css`
  if (existing) {
    if (existing.href === href) {
      return
    }
    existing.href = href
    return
  }
  const link = document.createElement("link")
  link.id = LINK_ID
  link.rel = "stylesheet"
  link.href = href
  document.head.appendChild(link)
}

/** 移除插件注入的主题覆盖（恢复跟随思源设置） */
export function clearHighlightTheme() {
  document.getElementById(LINK_ID)?.remove()
}
