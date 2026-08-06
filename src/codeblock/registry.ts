/**
 * 装饰模块注册表。
 *
 * 统一管理各装饰模块（当前行高亮/统计角标/长代码条/背景纹理）
 * 的「自身选择器 + 增强 + 清理」：
 * - selfSelector 聚合生成 MutationObserver 的忽略选择器（新模块自动纳入，永不漏登记）
 * - cleanup 聚合供增强清理调用（新模块自动清理，永不漏清理）
 * 新增装饰功能 = 新建模块文件 + 底部 registerDecor 一行，enhancer 零改动。
 */
import type { CodeBlockSettings } from "./settings"
import { ENHANCED_VALUE } from "../utils/dom"

export interface DecorContext {
  codeBlock: HTMLElement
  hljs: HTMLElement | null
  settings: CodeBlockSettings
}

export interface DecorModule {
  /** 自身注入元素的选择器（逗号分隔，供 MutationObserver 忽略） */
  selfSelector: string
  /** 增强：代码块首次增强（或 verify 补齐）时调用，必须幂等 */
  enhance: (ctx: DecorContext) => void
  /** 清理：移除增强并释放资源；preserve 为 true 时保留跨设置变更的状态 */
  cleanup: (codeBlock: HTMLElement, preserve: boolean) => void
}

const decorModules: DecorModule[] = []

/** 注册一个装饰模块（模块加载时调用） */
export function registerDecor(module: DecorModule): void {
  decorModules.push(module)
}

/** 聚合所有模块的自身选择器（MutationObserver 忽略用） */
export function getSelfSelectors(): string {
  return decorModules.map((m) => m.selfSelector).filter(Boolean).join(",")
}

/**
 * 对代码块执行全部装饰增强（幂等）。
 * 隔离保证：每个模块独立 try-catch——单个模块抛错（调试期/边界场景）不会
 * 中断其他模块的增强，杜绝「改 A 模块导致 B/C/D 全挂」。错误打印便于定位。
 */
export function enhanceAll(ctx: DecorContext): void {
  for (const m of decorModules) {
    try {
      m.enhance(ctx)
    } catch (err) {
      console.error("[code-block-beautify] enhance failed", err)
    }
  }
}

/**
 * 对代码块执行全部装饰清理。
 * 隔离保证：同上，单个模块清理异常不影响其他模块清理（卸载/切换文档时
 * 必须全部执行，否则残留注入元素）。
 */
export function cleanupAll(codeBlock: HTMLElement, preserve: boolean): void {
  for (const m of decorModules) {
    try {
      m.cleanup(codeBlock, preserve)
    } catch (err) {
      console.error("[code-block-beautify] cleanup failed", err)
    }
  }
}

/* ---------------- 折叠箭头刷新注册表（rerenderBlock 触发） ---------------- */

const blockRenderers = new WeakMap<HTMLElement, () => void>()

/** 注册某个代码块的折叠箭头刷新器 */
export function registerRenderer(codeBlock: HTMLElement, render: () => void): void {
  blockRenderers.set(codeBlock, render)
}

/** 触发某个代码块的折叠箭头重渲染（若已注册） */
export function rerenderBlock(codeBlock: HTMLElement): void {
  blockRenderers.get(codeBlock)?.()
}

/* ---------------- 完整增强入口（懒加载防御用） ---------------- */

/**
 * 完整增强某个代码块的回调（由 enhancer 在初始化时注入）。
 * 供装饰模块在「块从未被完整增强」时触发完整渲染——经 registry 正式接口
 * 调用，避免全局 window 钩子（__cbEnhanceBlock）污染全局命名空间。
 */
let enhanceBlockFn: ((codeBlock: HTMLElement) => void) | null = null

/** enhancer 注入完整增强入口（init 时调用一次） */
export function setEnhanceBlock(fn: (codeBlock: HTMLElement) => void): void {
  enhanceBlockFn = fn
}

/**
 * 确保某个代码块已被完整增强。
 * 返回 true = 增强已完成，调用方可直接渲染自身装饰；
 * 返回 false = 增强尚未完成（可能刚触发完整增强，将由增强流程渲染；
 * 或增强入口未注入），调用方应跳过本地渲染避免重复。
 */
export function ensureEnhanced(codeBlock: HTMLElement): boolean {
  if (codeBlock.dataset.cbEnhanced === ENHANCED_VALUE) {
    return true
  }
  if (enhanceBlockFn) {
    // 触发完整增强（增强流程会渲染所有装饰，含本模块）
    enhanceBlockFn(codeBlock)
  }
  return false
}
