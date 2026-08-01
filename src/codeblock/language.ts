/**
 * 读取思源代码块的语言标签。
 * 优先取 `.protyle-action__language`（思源原生语言徽章），
 * 兜底取 `.hljs code` 的 `language-xxx` class。
 */
export function getCodeBlockLanguage(codeBlock: HTMLElement): string {
  const langEl = codeBlock.querySelector<HTMLElement>(".protyle-action__language")
  if (langEl) {
    const text = (langEl.textContent ?? "").trim().toLowerCase()
    if (text) {
      return text
    }
  }
  const codeEl = codeBlock.querySelector<HTMLElement>(".hljs code")
  if (codeEl) {
    for (const cls of codeEl.classList) {
      if (cls.startsWith("language-")) {
        return cls.slice("language-".length).toLowerCase()
      }
    }
  }
  return ""
}
