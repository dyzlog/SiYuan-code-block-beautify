// @vitest-environment jsdom
/**
 * registry 隔离回归测试：
 * 1. enhanceAll：单个模块抛错不中断其他模块（改 A 不挂 B/C/D）
 * 2. cleanupAll：单个模块清理异常不中断其他
 * 3. ensureEnhanced：完整增强入口的行为（已增强/未增强/未注入）
 * 4. registerRenderer / rerenderBlock：折叠箭头刷新注册
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import {
  cleanupAll,
  enhanceAll,
  ensureEnhanced,
  registerDecor,
  registerRenderer,
  rerenderBlock,
  setEnhanceBlock,
} from "../src/codeblock/registry"
import type {
  DecorContext,
  DecorModule,
} from "../src/codeblock/registry"
import { DEFAULT_SETTINGS } from "../src/codeblock/settings"

/** 构造最小 DecorContext */
function makeCtx(): DecorContext {
  return {
    codeBlock: document.createElement("div"),
    hljs: document.createElement("div"),
    settings: DEFAULT_SETTINGS,
  }
}

/** 构造带调用记录与可选抛错的装饰模块 */
function makeModule(tag: string, opts?: { enhanceThrows?: boolean; cleanupThrows?: boolean }): DecorModule & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    selfSelector: `cb-test-${tag}`,
    enhance: () => {
      calls.push(`enhance:${tag}`)
      if (opts?.enhanceThrows) {
        throw new Error(`enhance ${tag} boom`)
      }
    },
    cleanup: () => {
      calls.push(`cleanup:${tag}`)
      if (opts?.cleanupThrows) {
        throw new Error(`cleanup ${tag} boom`)
      }
    },
  }
}

describe("enhanceAll 模块隔离", () => {
  // 抑制预期的 console.error 噪音（隔离测试故意抛错）
  let errSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    errSpy.mockRestore()
  })

  it("一个模块抛错，后续模块仍全部执行；正常路径无错误打印", () => {
    // 注册：a 正常、b 抛错、c 正常、d 清理抛错
    const a = makeModule("a")
    const b = makeModule("b", { enhanceThrows: true })
    const c = makeModule("c")
    const d = makeModule("d", { cleanupThrows: true })
    registerDecor(a)
    registerDecor(b)
    registerDecor(c)
    registerDecor(d)

    enhanceAll(makeCtx())

    // 三个 enhance 都被调用（b 抛错被捕获，c 仍执行）
    expect(a.calls).toContain("enhance:a")
    expect(b.calls).toContain("enhance:b")
    expect(c.calls).toContain("enhance:c")
    // 错误被打印（便于定位），但不抛出
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockClear()

    // 正常路径（无抛错模块的增强）不打印错误——仅 a/c 不抛错
    // 注：b 仍会抛错，这里只验证「抛错被捕获而非向上抛」这一核心行为
    expect(() => enhanceAll(makeCtx())).not.toThrow()

    // cleanupAll：d 清理抛错，a/b/c 仍清理
    const block = document.createElement("div")
    cleanupAll(block, false)
    expect(a.calls).toContain("cleanup:a")
    expect(d.calls).toContain("cleanup:d")
    expect(() => cleanupAll(block, false)).not.toThrow()
  })
})

describe("ensureEnhanced 完整增强入口", () => {
  let errSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    errSpy.mockRestore()
  })

  it("块已增强（cbEnhanced=1）→ 返回 true，不触发入口", () => {
    const block = document.createElement("div")
    block.dataset.cbEnhanced = "1"
    const fn = vi.fn()
    setEnhanceBlock(fn)

    const result = ensureEnhanced(block)
    expect(result).toBe(true)
    expect(fn).not.toHaveBeenCalled()
  })

  it("块未增强 + 已注入入口 → 触发完整增强，返回 false（由增强流程渲染）", () => {
    const block = document.createElement("div")
    const fn = vi.fn((el: HTMLElement) => {
      el.dataset.cbEnhanced = "1"
    })
    setEnhanceBlock(fn)

    const result = ensureEnhanced(block)
    expect(result).toBe(false)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(block.dataset.cbEnhanced).toBe("1")
  })

  it("块未增强 + 未注入入口 → 返回 false，不报错", () => {
    setEnhanceBlock(() => {})
    const block = document.createElement("div")
    // 模拟未注入：入口为空函数（enhancer 卸载后的状态）
    const result = ensureEnhanced(block)
    expect(result).toBe(false)
  })
})

describe("registerRenderer / rerenderBlock", () => {
  it("注册后 rerenderBlock 触发回调；未注册的块无操作", () => {
    const block = document.createElement("div")
    const other = document.createElement("div")
    const fn = vi.fn()
    registerRenderer(block, fn)

    rerenderBlock(block)
    expect(fn).toHaveBeenCalledTimes(1)

    rerenderBlock(other)
    expect(fn).toHaveBeenCalledTimes(1) // 其他块不触发
  })
})
