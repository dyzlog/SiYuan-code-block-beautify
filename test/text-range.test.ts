// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import {
  countVisibleLines,
  getLineStarts,
} from "../src/utils/text-range"

describe("getLineStarts", () => {
  it("单行", () => {
    expect(getLineStarts("abc")).toEqual([0])
  })

  it("多行（含末尾换行）", () => {
    expect(getLineStarts("a\nb\nc")).toEqual([0, 2, 4])
  })

  it("空字符串", () => {
    expect(getLineStarts("")).toEqual([0])
  })
})

describe("countVisibleLines", () => {
  it("普通多行", () => {
    expect(countVisibleLines("a\nb\nc")).toBe(3)
  })

  it("忽略末尾换行造成的多余空行", () => {
    expect(countVisibleLines("a\nb\n")).toBe(2)
  })

  it("空文本按 1 行", () => {
    expect(countVisibleLines("")).toBe(1)
  })
})
