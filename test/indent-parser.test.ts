import { describe, expect, it } from "vitest"
import {
  buildGuideSegments,
  computeIndentLevels,
  detectIndentWidth,
} from "../src/codeblock/indent-parser"

describe("computeIndentLevels", () => {
  it("计算普通缩进", () => {
    const code = "if x:\n    a = 1\n    b = 2\nelse:\n    c = 3"
    expect(computeIndentLevels(code)).toEqual([0, 4, 4, 0, 4])
  })

  it("空行继承前一行缩进", () => {
    const code = "def f():\n    a = 1\n\n    b = 2"
    expect(computeIndentLevels(code)).toEqual([0, 4, 4, 4])
  })

  it("注释行继承前一行缩进（竖线连续穿过）", () => {
    const code = "try:\n    a = 1\n    # 注释\n    b = 2"
    expect(computeIndentLevels(code)).toEqual([0, 4, 4, 4])
  })

  it("tab 按 4 空格展开", () => {
    const code = "if x:\n\ta = 1"
    expect(computeIndentLevels(code)).toEqual([0, 4])
  })

  it("文件头注释（0 缩进）继承 0", () => {
    const code = "# 文件说明\nimport os"
    expect(computeIndentLevels(code)).toEqual([0, 0])
  })
})

describe("detectIndentWidth", () => {
  it("取最常见非零缩进（全 4 空格）", () => {
    expect(detectIndentWidth([0, 4, 4, 4, 0, 4])).toBe(4)
  })

  it("忽略偶发缩进（2 出现 1 次，4 出现多次）", () => {
    expect(detectIndentWidth([0, 4, 4, 2, 4])).toBe(4)
  })

  it("2 空格习惯", () => {
    expect(detectIndentWidth([0, 2, 2, 2])).toBe(2)
  })

  it("无缩进回退默认 4", () => {
    expect(detectIndentWidth([0, 0, 0])).toBe(4)
  })
})

describe("buildGuideSegments", () => {
  it("try 块 4 空格：注释行继承缩进，竖线连续", () => {
    const indents = computeIndentLevels(
      "try:\n    a = 1\n    # 注释\n    b = 2\nexcept:\n    c = 3",
    )
    const segs = buildGuideSegments(indents, 4)
    // 1 级竖线：try 块 [1,3] + except 块 [5,5]
    expect(segs).toEqual([
      { level: 1, start: 1, end: 3 },
      { level: 1, start: 5, end: 5 },
    ])
  })

  it("嵌套缩进：多级段", () => {
    const indents = [0, 4, 8, 8, 4, 0]
    const segs = buildGuideSegments(indents, 4)
    expect(segs).toEqual([
      { level: 1, start: 1, end: 4 },
      { level: 2, start: 2, end: 3 },
    ])
  })

  it("缩进回退断开段", () => {
    const indents = [0, 4, 4, 0, 4, 4]
    const segs = buildGuideSegments(indents, 4)
    expect(segs).toEqual([
      { level: 1, start: 1, end: 2 },
      { level: 1, start: 4, end: 5 },
    ])
  })

  it("全缩进为空", () => {
    expect(buildGuideSegments([0, 0, 0], 4)).toEqual([])
  })
})
