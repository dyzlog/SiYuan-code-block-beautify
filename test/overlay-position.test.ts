// @vitest-environment jsdom
/**
 * overlay 定位回归测试：overlay 是 codeBlock 的兄弟节点（absolute + transform）。
 * - 不在 codeBlock 内部 → 思源序列化（outerHTML）不会带走 overlay（防污染）
 * - 锚定 .protyle-wysiwyg（position: relative），transform 表达 codeBlock 偏移
 * - 滚动时 transform 不变（随内容原生跟随），onScroll 只更新 clip 裁剪
 */
import { describe, expect, it } from "vitest"

if (!("ResizeObserver" in window)) {
  window.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver
}
if (!("IntersectionObserver" in window)) {
  window.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof IntersectionObserver
}

import { getOverlay } from "../src/utils/overlay"

function makeRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left, top, width, height,
    right: left + width,
    bottom: top + height,
    x: left, y: top,
    toJSON: () => ({}),
  } as DOMRect
}

function buildEditor(): { code: HTMLElement; ov: HTMLElement; wysiwyg: HTMLElement } {
  const protyle = document.createElement("div")
  protyle.className = "protyle"
  protyle.style.position = "relative"
  const content = document.createElement("div")
  content.className = "protyle-content"
  content.style.overflow = "auto"
  const wysiwyg = document.createElement("div")
  wysiwyg.className = "protyle-wysiwyg"
  const code = document.createElement("div")
  code.className = "code-block"
  code.setAttribute("data-node-id", "b1")
  code.setAttribute("data-type", "NodeCodeBlock")
  code.style.position = "relative"
  const hljs = document.createElement("div")
  hljs.className = "hljs"
  hljs.textContent = "if (a) {\n  b()\n}"
  code.appendChild(hljs)
  wysiwyg.appendChild(code)
  content.appendChild(wysiwyg)
  protyle.appendChild(content)
  document.body.appendChild(protyle)

  protyle.getBoundingClientRect = () => makeRect(0, 0, 800, 600)
  content.getBoundingClientRect = () => makeRect(0, 0, 800, 600)
  wysiwyg.getBoundingClientRect = () => makeRect(0, 0, 800, 600)
  code.getBoundingClientRect = () => makeRect(100, 200, 400, 120)

  const ov = getOverlay(code)
  return { code, ov, wysiwyg }
}

describe("overlay 兄弟节点定位", () => {
  it("overlay 是 codeBlock 的兄弟节点且插在 wysiwyg 最前面（防污染 + 避开遍历）", () => {
    const { code, ov, wysiwyg } = buildEditor()
    // 不在 codeBlock 内部 → 思源 outerHTML 序列化不会带走它（防污染）
    expect(code.contains(ov)).toBe(false)
    // 插在 wysiwyg 最前面 → 思源块框选向后遍历不会经过它（不闪烁）
    expect(ov.parentElement).toBe(wysiwyg)
    expect(wysiwyg.firstElementChild).toBe(ov)
    document.body.innerHTML = ""
  })

  it("overlay 锚定 .protyle-wysiwyg（获得 position: relative）", () => {
    const { wysiwyg } = buildEditor()
    expect(wysiwyg.style.position).toBe("relative")
    document.body.innerHTML = ""
  })

  it("absolute 定位 + pointer-events none（纯视觉层）", () => {
    const { ov } = buildEditor()
    expect(ov.style.position).toBe("absolute")
    expect(ov.style.pointerEvents).toBe("none")
    document.body.innerHTML = ""
  })
})
