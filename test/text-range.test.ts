// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import {
  countVisibleLines,
  getLineStarts,
  splitLineNodeGroups,
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

describe("splitLineNodeGroups", () => {
  it("span + \\n 文本节点结构正确分行", () => {
    const root = document.createElement("div")
    const s1 = document.createElement("span")
    s1.textContent = "if (a) {"
    root.appendChild(s1)
    root.appendChild(document.createTextNode("\n"))
    const s2 = document.createElement("span")
    s2.textContent = "  b()"
    root.appendChild(s2)
    root.appendChild(document.createTextNode("\n"))
    const s3 = document.createElement("span")
    s3.textContent = "}"
    root.appendChild(s3)

    const rows = splitLineNodeGroups(root)
    // 3 行：if / b() / }
    expect(rows.length).toBe(3)
    expect(rows[0].length).toBeGreaterThan(0)
    expect(rows[1].length).toBeGreaterThan(0)
    expect(rows[2].length).toBeGreaterThan(0)
  })

  it("省略行占位视为一行", () => {
    const root = document.createElement("div")
    const s1 = document.createElement("span")
    s1.textContent = "if (a) {"
    root.appendChild(s1)
    root.appendChild(document.createTextNode("\n"))
    const ellipsis = document.createElement("div")
    ellipsis.className = "cb-fold-ellipsis"
    root.appendChild(ellipsis)
    root.appendChild(document.createTextNode("\n"))
    const s2 = document.createElement("span")
    s2.textContent = "}"
    root.appendChild(s2)

    const rows = splitLineNodeGroups(root)
    // 3 行：if / 省略行 / }
    expect(rows.length).toBe(3)
  })
})
