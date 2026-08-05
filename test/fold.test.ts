import { describe, expect, it } from "vitest"
import { findFoldRegions } from "../src/codeblock/fold"

describe("findFoldRegions - 花括号语言", () => {
  it("JS 基础块", () => {
    const code = "function f() {\n  if (x) {\n    y()\n  }\n}"
    const regions = findFoldRegions(code, "javascript")
    // 按 start 升序：函数块 [0,4] 在外，if 块 [1,3] 在内
    expect(regions).toEqual([
      { start: 0, end: 4 },
      { start: 1, end: 3 },
    ])
  })

  it("忽略字符串/注释里的花括号（f-string 防误判）", () => {
    const code = "const s = `{x}`; // }\nfunction f() {\n  return 1\n}"
    const regions = findFoldRegions(code, "javascript")
    // 只有真实函数块 [1,3]
    expect(regions).toEqual([{ start: 1, end: 3 }])
  })

  it("C 语言结构", () => {
    const code = "int main() {\n  int a = 1;\n  return 0;\n}"
    const regions = findFoldRegions(code, "c")
    expect(regions).toEqual([{ start: 0, end: 3 }])
  })
})

describe("findFoldRegions - 缩进语言（Python）", () => {
  it("函数定义块", () => {
    const code = "def f():\n    a = 1\n    return a\n\nx = 1"
    const regions = findFoldRegions(code, "python")
    // 空行继承缩进归属块内，直到下一个 0 缩进行（x = 1）闭合，end = 3（空行）
    expect(regions).toEqual([{ start: 0, end: 3 }])
  })

  it("try-except 块各自成区", () => {
    const code = "try:\n    a = 1\nexcept:\n    b = 2"
    const regions = findFoldRegions(code, "python")
    expect(regions).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
    ])
  })

  it("忽略字典/切片中的冒号", () => {
    const code = "d = {'a': 1}\nfor k in d:\n    print(k)"
    const regions = findFoldRegions(code, "python")
    // 只有 for 块
    expect(regions).toEqual([{ start: 1, end: 2 }])
  })

  it("语言标签为 python 时强制缩进解析（即使含字典花括号，不被误判为花括号语言）", () => {
    // 历史 bug：f-string / 字典 `{}` 曾导致 python 代码被误判为花括号语言
    const code = "d = {'a': {'b': 1}}\nfor k in d:\n    print(k)"
    const regions = findFoldRegions(code, "python")
    expect(regions).toEqual([{ start: 1, end: 2 }])
  })

  it("空代码 / 单行代码 → 无折叠区域", () => {
    expect(findFoldRegions("", "python")).toEqual([])
    expect(findFoldRegions("x = 1", "python")).toEqual([])
  })
})

describe("findFoldRegions - 语言未知时启发式", () => {
  it("花括号内容多 → 按花括号", () => {
    const code = "a = {\n  b: 1,\n  c: 2\n}"
    const regions = findFoldRegions(code)
    expect(regions.length).toBeGreaterThan(0)
  })
})
