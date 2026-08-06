// @vitest-environment jsdom
/**
 * overlay 定位回归测试：静态位置缓存方案。
 * transform = blockRect(当前) - staticRect(创建时记录的初始视口位置)。
 * 滚动时两者同步变化 → 差值恒定 → transform 不变 → overlay 随内容滚动。
 */
import { describe, expect, it, vi } from "vitest"

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

  // mock 初始位置：protyle 在 (0,0)，codeBlock 在 (100, 200)，overlay 静态在 (0,0)
  protyle.getBoundingClientRect = () => makeRect(0, 0, 800, 600)
  content.getBoundingClientRect = () => makeRect(0, 0, 800, 600)
  code.getBoundingClientRect = () => makeRect(100, 200, 400, 120)

  const ov = getOverlay(code)
  // 创建时静态位置：overlay 在 (0,0)（absolute left:0 top:0 相对 .protyle）
  return { code, ov }
}

function transformOf(ov: HTMLElement): { x: number; y: number } | null {
  const m = ov.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/)
  if (!m) {
    return null
  }
  return { x: Number.parseFloat(m[1]), y: Number.parseFloat(m[2]) }
}

describe("overlay 静态位置定位", () => {
  it("transform = blockRect - staticRect（首次定位正确）", () => {
    const { code, ov } = buildEditor()
    // 创建时 staticRect = (0,0)，blockRect = (100,200) → transform = (100, 200)
    const t = transformOf(ov)
    expect(t).not.toBeNull()
    expect(t!.x).toBe(100)
    expect(t!.y).toBe(200)
    document.body.innerHTML = ""
  })

  it("滚动后（blockRect 变化、staticRect 不变）transform 更新跟随", async () => {
    const { code, ov } = buildEditor()
    // 滚动后 codeBlock 上移到 (100, 50)
    code.getBoundingClientRect = () => makeRect(100, 50, 400, 120)
    // 真实滚动走 onScroll（直接 applyGeom，不经 syncOverlay 帧去重）
    // 模拟：等一帧让 WeakSet 去重恢复，再 getOverlay 触发 syncOverlay
    await new Promise((r) => setTimeout(r, 20))
    getOverlay(code)
    const t = transformOf(ov)
    expect(t).not.toBeNull()
    expect(t!.y).toBe(50)
    document.body.innerHTML = ""
  })

  it("overlay 与 codeBlock 是兄弟节点", () => {
    const { code, ov } = buildEditor()
    expect(ov.parentElement).toBe(code.parentElement)
    expect(ov.previousElementSibling).toBe(code)
    document.body.innerHTML = ""
  })
})
