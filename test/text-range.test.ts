// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import {
  countVisibleLines,
  getLineStarts,
} from "../src/utils/text-range"

describe("getLineStarts", () => {
  it("鍗曡�", () => {
    expect(getLineStarts("abc")).toEqual([0])
  })

  it("澶氳�锛堝惈鏈�熬鎹㈣�锛�", () => {
    expect(getLineStarts("a\nb\nc")).toEqual([0, 2, 4])
  })

  it("绌哄瓧绗︿覆", () => {
    expect(getLineStarts("")).toEqual([0])
  })
})

describe("countVisibleLines", () => {
  it("鏅�€氬�琛�", () => {
    expect(countVisibleLines("a\nb\nc")).toBe(3)
  })

  it("蹇界暐鏈�熬鎹㈣�閫犳垚鐨勫�浣欑┖琛�", () => {
    expect(countVisibleLines("a\nb\n")).toBe(2)
  })

  it("绌烘枃鏈�寜 1 琛�", () => {
    expect(countVisibleLines("")).toBe(1)
  })
})
