// @vitest-environment jsdom
/**
 * 回归测试：折叠状态跨会话持久化。
 * 点击收起后状态写入插件存储；重开思源（销毁增强器 + 重建 DOM）后，
 * 重新增强的长代码块应按持久化状态恢复折叠。
 */
import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest"
import {
  destroyCodeBlockEnhancer,
  initCodeBlockEnhancer,
} from "../src/codeblock/enhancer"
import { initFoldPersistence } from "../src/codeblock/longcode"
import { DEFAULT_SETTINGS } from "../src/codeblock/settings"
import { Plugin } from "./stubs/siyuan"

// ---- jsdom 缺失浏览器 API 兜底（与 overlay-cleanup 测试一致）----
if (!("IntersectionObserver" in window)) {
  window.IntersectionObserver = class {
    private cb: IntersectionObserverCallback
    constructor(cb: IntersectionObserverCallback) { this.cb = cb }
    observe(target: Element) {
      this.cb([{ target, isIntersecting: true } as unknown as IntersectionObserverEntry], this as unknown as IntersectionObserver)
    }
    disconnect() {}
    unobserve() {}
    takeRecords() { return [] }
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
if (typeof globalThis.Node === "undefined") {
  ;(globalThis as unknown as { Node: typeof Node }).Node = window.Node
}
if (typeof HTMLElement.prototype.checkVisibility !== "function") {
  HTMLElement.prototype.checkVisibility = () => true
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** 构造 25 行长代码块（> 阈值 20），挂到 body */
function mountLongCodeBlock(blockId: string): HTMLElement {
  const parent = document.createElement("div")
  parent.className = "protyle-wysiwyg"
  const block = document.createElement("div")
  block.className = "code-block"
  block.setAttribute("data-node-id", blockId)
  const hljs = document.createElement("div")
  hljs.className = "hljs"
  hljs.textContent = Array.from({ length: 25 }, (_, i) => `const v${i} = ${i};`).join("\n")
  block.appendChild(hljs)
  parent.appendChild(block)
  document.body.appendChild(parent)
  return block
}

function getFoldBtn(codeBlock: HTMLElement): HTMLButtonElement | null {
  return codeBlock.parentElement?.querySelector<HTMLButtonElement>(".cb-longcode-btn") ?? null
}

describe("折叠状态跨会话持久化", () => {
  afterEach(() => {
    document.body.innerHTML = ""
    destroyCodeBlockEnhancer()
  })

  it("点击收起后持久化，重新增强时恢复折叠状态", async () => {
    const plugin = new Plugin()
    await initFoldPersistence(plugin)

    // 第一轮：初始化增强器 + 挂载长代码块
    initCodeBlockEnhancer(plugin, DEFAULT_SETTINGS)
    const block1 = mountLongCodeBlock("20260817000000-test001")
    await sleep(600)

    const btn = getFoldBtn(block1)
    expect(btn).not.toBeNull()
    expect(block1.classList.contains("cb-longcode-folded")).toBe(false)

    // 点击按钮 → 收起，状态写入插件存储
    block1.dispatchEvent(new MouseEvent("click"))
    await sleep(50)
    expect(block1.classList.contains("cb-longcode-folded")).toBe(true)
    const saved = await plugin.loadData<Record<string, boolean>>("foldStates")
    expect(saved?.["20260817000000-test001"]).toBe(true)

    // 第二轮：模拟重开思源——销毁增强器 + 清空 DOM（折叠状态仅存于插件存储）
    destroyCodeBlockEnhancer()
    document.body.innerHTML = ""

    // 重新初始化增强器 + 重建 DOM
    initCodeBlockEnhancer(plugin, DEFAULT_SETTINGS)
    const block2 = mountLongCodeBlock("20260817000000-test001")
    await sleep(600)

    // 恢复折叠：重新增强的代码块按持久化状态保持折叠。
    // 注：jsdom 无真实布局，measureLineAt 返回 top=0 → topNHeight=0，
    // maxHeight 不设置（真实浏览器正常）；以折叠 class 与按钮文本为恢复证据。
    expect(block2.classList.contains("cb-longcode-folded")).toBe(true)
    // 按钮文本反映折叠状态（"展开" = 已折叠，等待展开）
    const btn2 = getFoldBtn(block2)
    expect(btn2?.textContent).toBe("展开")
  })
})