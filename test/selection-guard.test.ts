// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { shouldClearBlockSelect } from "../src/codeblock/selection-guard"

describe("shouldClearBlockSelect", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="code-block">
        <div class="hljs">abc</div>
      </div>
    `
  })

  afterEach(() => {
    window.getSelection()?.removeAllRanges()
    document.body.innerHTML = ""
  })

  it("treats a range anchored on the .hljs element itself as a code-text selection", () => {
    const hljs = document.querySelector<HTMLElement>(".hljs")
    expect(hljs).not.toBeNull()

    const range = document.createRange()
    range.setStart(hljs!, 0)
    range.setEnd(hljs!, 1)

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    expect(shouldClearBlockSelect(selection, hljs)).toBe(true)
  })

  it("returns false for selections outside the code block", () => {
    const hljs = document.querySelector<HTMLElement>(".hljs")
    const outside = document.createElement("div")
    outside.textContent = "outside"
    document.body.appendChild(outside)

    const range = document.createRange()
    range.setStart(outside.firstChild!, 0)
    range.setEnd(outside.firstChild!, 7)

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    expect(shouldClearBlockSelect(selection, hljs)).toBe(false)
  })
})
