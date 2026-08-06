// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

if (!("ResizeObserver" in window)) {
  window.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver
}

import { getOverlay } from "../src/utils/overlay"
import { measureLineAt } from "../src/codeblock/line-measure-service"

describe("fold-arrows 定位测量", () => {
  it("measureLineAt 对 jsdom 环境安全回退（不抛错，top 可为 0）", () => {
    const hljs = document.createElement("div")
    hljs.className = "hljs"
    hljs.textContent = "if (a) {\n  b()\n}"
    const { top, height } = measureLineAt(hljs, hljs.textContent ?? "", 0)
    expect(typeof top).toBe("number")
    expect(typeof height).toBe("number")
  })

  it("getOverlay 可创建 overlay 容器", () => {
    const block = document.createElement("div")
    block.className = "code-block"
    const hljs = document.createElement("div")
    hljs.className = "hljs"
    hljs.textContent = "if (a) {\n  b()\n}"
    block.appendChild(hljs)
    document.body.appendChild(block)

    const ov = getOverlay(block)
    expect(ov).not.toBeNull()
    expect(ov.className).toBe("cb-overlay")
    block.remove()
  })
})
