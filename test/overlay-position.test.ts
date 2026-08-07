// @vitest-environment jsdom
/**
 * overlay 定位回归测试：overlay 是 codeBlock 的内部子元素（absolute inset:0）。
 * - 随 codeBlock 自动定位/滚动，无 transform
 * - 不修改 .protyle-wysiwyg 的 position
 * - 尺寸与 codeBlock 一致
 * - 滚动裁剪（clip-path）仅在视口外时隐藏
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

describe("overlay 内部子元素定位", () => {
  it("overlay 是 codeBlock 的子元素（非兄弟），absolute inset 0", () => {
    const { code, ov } = buildEditor()
    expect(ov.parentElement).toBe(code)
    expect(ov.style.position).toBe("absolute")
    expect(ov.style.inset).toBe("0px")
    expect(ov.style.transform).toBe("")
    document.body.innerHTML = ""
  })

  it("不修改 .protyle-wysiwyg 的 position（不污染思源布局）", () => {
    const { wysiwyg } = buildEditor()
    expect(wysiwyg.style.position).toBe("")
    document.body.innerHTML = ""
  })

  it("尺寸与 codeBlock 一致（内部装饰绝对定位依赖）", () => {
    const { ov } = buildEditor()
    expect(ov.style.width).toBe("400px")
    expect(ov.style.height).toBe("120px")
    document.body.innerHTML = ""
  })

  it("不可编辑 + 不拦截鼠标（纯视觉层）", () => {
    const { ov } = buildEditor()
    expect(ov.getAttribute("contenteditable")).toBe("false")
    expect(ov.style.pointerEvents).toBe("none")
    document.body.innerHTML = ""
  })
})
