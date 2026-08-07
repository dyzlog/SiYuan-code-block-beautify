import { JSDOM } from "jsdom"

const dom = new JSDOM(`<!DOCTYPE html><body>
<div class="protyle"><div class="protyle-content" style="overflow:auto;height:600px">
<div class="protyle-wysiwyg"><div class="code-block" data-node-id="b1" data-type="NodeCodeBlock" style="position:relative"><div class="hljs">code</div></div><div class="p">para</div></div>
</div></div>
</body>`, { pretendToBeVisual: true })
const { window } = dom
const { document } = window

const code = document.querySelector(".code-block") as HTMLElement
const wysiwyg = document.querySelector(".protyle-wysiwyg") as HTMLElement

// 模拟滚动容器与视口
Object.defineProperty(wysiwyg, "getBoundingClientRect", { value: () => ({ top: 300, left: 24, width: 752, height: 1000, right: 776, bottom: 1300 }) })
Object.defineProperty(code, "getBoundingClientRect", { value: () => ({ top: 500, left: 24, width: 300, height: 100, right: 324, bottom: 600 }) })

console.log("code.parentElement.className:", code.parentElement?.className)
console.log("code.offsetTop (before relative):", code.offsetTop)
console.log("code.offsetLeft (before relative):", code.offsetLeft)

// 模拟 overlay 插入（absolute top:0 left:0，父容器加 relative）
const ov = document.createElement("div")
ov.className = "cb-overlay"
ov.style.position = "absolute"
ov.style.left = "0"
ov.style.top = "0"
const parent = code.parentElement as HTMLElement
if (!parent.style.position) {
  parent.style.position = "relative"
}
parent.insertBefore(ov, code)

console.log("parent after relative:", parent.className, parent.style.position)
console.log("code.offsetTop (after relative):", code.offsetTop)
console.log("ov.offsetTop:", ov.offsetTop, "ov.offsetLeft:", ov.offsetLeft)
console.log("=> transform/top 应为:", code.offsetTop - ov.offsetTop, code.offsetLeft - ov.offsetLeft)
