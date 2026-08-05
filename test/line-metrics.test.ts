// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import {
  computeAvgGap,
  computeVirtualWindow,
  fallbackLineHeight,
  fillEmptyRows,
} from "../src/codeblock/line-metrics"

describe("computeVirtualWindow", () => {
  it("短代码（≤阈值）全量渲染", () => {
    expect(computeVirtualWindow({
      total: 50,
      scrollTop: 0,
      viewH: 300,
      avgGap: 20,
    })).toEqual([0, 49])
  })

  it("长代码：滚动到顶部时窗口从 0 开始", () => {
    const [first, last] = computeVirtualWindow({
      total: 1000,
      scrollTop: 0,
      viewH: 400,
      avgGap: 20,
    })
    expect(first).toBe(0)
    expect(last).toBeGreaterThan(0)
    expect(last).toBeLessThan(1000)
  })

  it("长代码：滚动到中部时窗口跟随", () => {
    const [first, last] = computeVirtualWindow({
      total: 1000,
      scrollTop: 5000,
      viewH: 400,
      avgGap: 20,
    })
    // 5000/20 = 250 行附近，含缓冲
    expect(first).toBeGreaterThan(200)
    expect(first).toBeLessThan(300)
    expect(last).toBeGreaterThan(first)
    expect(last).toBeLessThan(1000)
  })

  it("折叠态强制全量", () => {
    expect(computeVirtualWindow({
      total: 1000,
      scrollTop: 0,
      viewH: 400,
      avgGap: 20,
      full: true,
    })).toEqual([0, 999])
  })

  it("avgGap 无效时全量", () => {
    expect(computeVirtualWindow({
      total: 1000,
      scrollTop: 0,
      viewH: 400,
      avgGap: 0,
    })).toEqual([0, 999])
  })
})

describe("computeAvgGap", () => {
  it("均匀行距", () => {
    // 行 0/1/2 top 分别为 0/20/40
    expect(computeAvgGap([0, 20, 40], 3)).toBe(20)
  })

  it("含缺失行（空行）时按跨距平均", () => {
    // 行 0 和 2 已知，跨 2 行差 40 → 每行 20
    const tops: number[] = [0, undefined, 40]
    expect(computeAvgGap(tops, 3)).toBe(20)
  })

  it("单行返回 0", () => {
    expect(computeAvgGap([10], 1)).toBe(0)
  })

  it("无有效行返回 0", () => {
    const tops: number[] = [undefined, undefined]
    expect(computeAvgGap(tops, 2)).toBe(0)
  })
})

describe("fillEmptyRows", () => {
  const makeHljs = (text: string) => {
    const el = document.createElement("div")
    el.textContent = text
    return el
  }

  it("填充中间空行（按平均间距推算）", () => {
    const tops: number[] = [0, undefined, 40]
    fillEmptyRows(tops, 3, 20, makeHljs("a\nb\nc"))
    expect(tops).toEqual([0, 20, 40])
  })

  it("无平均间距时缺失行沿用上一行", () => {
    const tops: number[] = [10, undefined]
    fillEmptyRows(tops, 2, 0, makeHljs("a\nb"))
    expect(tops).toEqual([10, 10])
  })

  it("补齐尾部行（文本行数多于测量行数）", () => {
    const tops: number[] = [0, 20]
    // 文本 4 行，仅测到 2 行 → 补到 4 行
    fillEmptyRows(tops, 2, 20, makeHljs("a\nb\nc\nd"))
    expect(tops.length).toBe(4)
    expect(tops[2]).toBe(40)
    expect(tops[3]).toBe(60)
  })
})

describe("fallbackLineHeight", () => {
  it("读取 computed line-height（normal 时按字号×1.6）", () => {
    const el = document.createElement("div")
    el.style.fontSize = "20px"
    el.style.lineHeight = "normal"
    document.body.appendChild(el)
    // jsdom 下 fontSize 可解析，lineHeight normal → 20 * 1.6
    expect(fallbackLineHeight(el)).toBeGreaterThan(0)
    el.remove()
  })
})
