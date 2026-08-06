// @vitest-environment jsdom
/**
 * 回归测试：思源动态加载（滚动到文档边界）移除代码块时，
 * 兄弟 overlay 装饰不能残留在 DOM 中（否则 fixed 定位的装饰会停留在视口内持续显示）。
 */
import {
  describe,
  expect,
  it,
} from "vitest"
import {
  destroyCodeBlockEnhancer,
  initCodeBlockEnhancer,
} from "../src/codeblock/enhancer"
import { DEFAULT_SETTINGS } from "../src/codeblock/settings"

// jsdom 缺失/不完整的浏览器 API 兜底（与 scripts/test-repro.ts 一致）
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = (() => ({
    top: 0,
    bottom: 0,
    height: 0,
    width: 0,
    left: 0,
    right: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })) as typeof Range.prototype.getBoundingClientRect
}
if (!("IntersectionObserver" in window)) {
  // stub：observe 时立即触发回调（模拟进入视口）。
  // 真实浏览器 IO 异步触发；jsdom 无真实布局，同步触发保证测试确定
  window.IntersectionObserver = class {
    private cb: IntersectionObserverCallback
    constructor(cb: IntersectionObserverCallback) {
      this.cb = cb
    }
    observe(target: Element) {
      this.cb([{ target, isIntersecting: true } as unknown as IntersectionObserverEntry], this as unknown as IntersectionObserver)
    }
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return []
    }
    root = null
    rootMargin = ""
    thresholds = []
  } as unknown as typeof IntersectionObserver
}
if (!("ResizeObserver" in window)) {
  window.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver
}
// vitest jsdom 环境下 Node 全局可能缺失（enhancer 的 MutationObserver 回调使用）
if (typeof globalThis.Node === "undefined") {
  ;(globalThis as unknown as { Node: typeof Node }).Node = window.Node
}
// jsdom 无真实布局，checkVisibility/offsetParent 均不可用 → 代码块会被视为不可见而跳过增强
if (typeof HTMLElement.prototype.checkVisibility !== "function") {
  HTMLElement.prototype.checkVisibility = () => true
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

console.log("[probe] typeof Node:", typeof Node, "typeof window.Node:", typeof window.Node, "typeof globalThis.Node:", typeof globalThis.Node)

describe("代码块被移除时 overlay 清理（思源动态加载场景）", () => {
  it("codeBlock 从 DOM 移除后，兄弟 overlay 应一并清理，不残留", async () => {
    const plugin = {
      eventBus: {
        on: () => {},
        off: () => {},
      },
    } as unknown as Parameters<typeof initCodeBlockEnhancer>[0]
    initCodeBlockEnhancer(plugin, DEFAULT_SETTINGS)

    const parent = document.createElement("div")
    parent.className = "protyle-wysiwyg"
    const block = document.createElement("div")
    block.className = "code-block"
    const hljs = document.createElement("div")
    hljs.className = "hljs"
    hljs.textContent = "const a = 1\nconst b = 2"
    block.appendChild(hljs)
    parent.appendChild(block)
    document.body.appendChild(parent)

    // 等待首轮扫描完成增强（scheduleIdle 回退为 setTimeout ~120ms）
    await sleep(600)
    const overlay = parent.querySelector(".cb-overlay")
    expect(overlay).not.toBeNull()

    // 模拟思源动态加载：只移除代码块自身。
    // overlay 是 codeBlock 的兄弟节点，不会随其自动移除 → 必须被插件清理
    block.remove()
    await sleep(600) // 等待 MutationObserver 处理 removedNodes

    const leftovers = document.querySelectorAll(".cb-overlay")
    expect(leftovers.length).toBe(0)

    destroyCodeBlockEnhancer()
  })

  it("移除包含多个代码块的容器时，全部 overlay 均被清理", async () => {
    const plugin = {
      eventBus: {
        on: () => {},
        off: () => {},
      },
    } as unknown as Parameters<typeof initCodeBlockEnhancer>[0]
    initCodeBlockEnhancer(plugin, DEFAULT_SETTINGS)

    const parent = document.createElement("div")
    parent.className = "protyle-wysiwyg"
    const mkBlock = (text: string) => {
      const block = document.createElement("div")
      block.className = "code-block"
      const hljs = document.createElement("div")
      hljs.className = "hljs"
      hljs.textContent = text
      block.appendChild(hljs)
      return block
    }
    const b1 = mkBlock("x = 1")
    const b2 = mkBlock("y = 2")
    parent.append(b1, b2)
    document.body.appendChild(parent)

    await sleep(600)
    expect(parent.querySelectorAll(".cb-overlay").length).toBe(2)

    // 整个容器（如 protyle 重建）被移除
    parent.remove()
    await sleep(600)

    expect(document.querySelectorAll(".cb-overlay").length).toBe(0)

    destroyCodeBlockEnhancer()
  })
})
