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

function buildEditor(): { code: HTMLElement; ov: HTMLElement; wysiwyg: HTMLElement; content: HTMLElement } {
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
  return { code, ov, wysiwyg, content }
}

describe("overlay 挂载与定位", () => {
  it("overlay 挂在滚动容器 .protyle-content 下，不在 codeBlock 内部也不在 wysiwyg 文档内容容器内（防序列化污染）", () => {
    const { code, ov, wysiwyg, content } = buildEditor()
    // 不在 codeBlock 内部 → 思源序列化代码块不会带走它
    expect(code.contains(ov)).toBe(false)
    // 不在 .protyle-wysiwyg（文档内容容器）内 → 思源整篇序列化不会把它当
    // HTML 块写入文档（实测污染根因：overlay 在 wysiwyg 内会被存成 NodeHTMLBlock）
    expect(wysiwyg.contains(ov)).toBe(false)
    // 挂在滚动容器下（与代码块同滚动容器，随内容移动）
    expect(ov.parentElement).toBe(content)
    document.body.innerHTML = ""
  })

  it("滚动容器获得 position: relative（overlay 的 offsetParent 落在滚动容器内，滚动时随内容移动）", () => {
    const { content } = buildEditor()
    // overlay 的 offsetParent 必须是滚动容器：absolute 定位相对容器内容坐标，
    // 滚动时 overlay 才随代码块一起移动（否则 offsetParent 是外层 .protyle 时
    // overlay 不随容器滚动，位置错位）
    expect(content.style.position).toBe("relative")
    document.body.innerHTML = ""
  })

  it("absolute 定位 + pointer-events none（纯视觉层）", () => {
    const { ov } = buildEditor()
    expect(ov.style.position).toBe("absolute")
    expect(ov.style.pointerEvents).toBe("none")
    document.body.innerHTML = ""
  })
})
