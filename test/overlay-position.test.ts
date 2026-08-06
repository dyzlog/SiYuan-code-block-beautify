// @vitest-environment jsdom
/**
 * overlay 定位回归测试：锚定 .protyle-wysiwyg 方案。
 * transform = codeBlock 相对 wysiwyg 的偏移（滚动时不变，原生跟随）；
 * onScroll 只更新 clip 裁剪。
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

function buildEditor(): { code: HTMLElement; ov: HTMLElement } {
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

  // mock：wysiwyg 在 (0,0)，codeBlock 在 (100, 200)（相对 wysiwyg 的偏移）
  protyle.getBoundingClientRect = () => makeRect(0, 0, 800, 600)
  content.getBoundingClientRect = () => makeRect(0, 0, 800, 600)
  wysiwyg.getBoundingClientRect = () => makeRect(0, 0, 800, 600)
  code.getBoundingClientRect = () => makeRect(100, 200, 400, 120)

  const ov = getOverlay(code)
  return { code, ov }
}

function transformOf(ov: HTMLElement): { x: number; y: number } | null {
  const m = ov.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/)
  if (!m) {
    return null
  }
  return { x: Number.parseFloat(m[1]), y: Number.parseFloat(m[2]) }
}

describe("overlay 锚定 wysiwyg 定位", () => {
  it("transform = codeBlock 相对 wysiwyg 的偏移（首次定位正确）", () => {
    const { ov } = buildEditor()
    // wysiwyg 在 (0,0)，codeBlock 在 (100,200) → transform = (100, 200)
    const t = transformOf(ov)
    expect(t).not.toBeNull()
    expect(t!.x).toBe(100)
    expect(t!.y).toBe(200)
    document.body.innerHTML = ""
  })

  it("滚动后（两者一起移动）transform 不变——原生跟随，无浮动", async () => {
    const { code, ov } = buildEditor()
    // 滚动后 wysiwyg 和 codeBlock 一起上移 150px（视口坐标同步变化）
    const wysiwyg = code.parentElement!
    wysiwyg.getBoundingClientRect = () => makeRect(0, -150, 800, 600)
    code.getBoundingClientRect = () => makeRect(100, 50, 400, 120)
    // 触发同步（真实滚动走 onScroll 只更新 clip，不更新 transform）
    await new Promise((r) => setTimeout(r, 20))
    getOverlay(code)
    const t = transformOf(ov)
    expect(t).not.toBeNull()
    // transform 保持不变（相对 wysiwyg 偏移恒定）→ 零浮动
    expect(t!.y).toBe(200)
    document.body.innerHTML = ""
  })

  it("overlay 与 codeBlock 是兄弟节点，wysiwyg 获得 position: relative", () => {
    const { code, ov } = buildEditor()
    expect(ov.parentElement).toBe(code.parentElement)
    expect(ov.previousElementSibling).toBe(code)
    const wysiwyg = code.parentElement!
    expect(wysiwyg.style.position).toBe("relative")
    document.body.innerHTML = ""
  })
})
