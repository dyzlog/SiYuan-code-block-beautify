/**
 * 复现"无限产生空白行"：观察折叠后 .hljs 内容/行号列是否持续增长
 */
import { JSDOM } from "jsdom"
import { initCodeBlockEnhancer, destroyCodeBlockEnhancer } from "../src/codeblock/enhancer.ts"
import { toggleFold, clearFoldState } from "../src/codeblock/folding.ts"
import { unregisterRenderer } from "../src/codeblock/registry.ts"
import { DEFAULT_SETTINGS } from "../src/codeblock/settings.ts"

const dom = new JSDOM("<!DOCTYPE html><body></body>")
// eslint-disable-next-line no-explicit-any
if (!dom.window.Range.prototype.getBoundingClientRect) {
  // eslint-disable-next-line no-explicit-any
  dom.window.Range.prototype.getBoundingClientRect = () => ({ top: 0, bottom: 0, height: 0, width: 0, left: 0, right: 0, x: 0, y: 0, toJSON: () => ({}) })
}
// eslint-disable-next-line no-explicit-any
;(globalThis as any).window = dom.window
// eslint-disable-next-line no-explicit-any
;(globalThis as any).document = dom.window.document
// eslint-disable-next-line no-explicit-any
;(globalThis as any).NodeFilter = dom.window.NodeFilter
// eslint-disable-next-line no-explicit-any
;(globalThis as any).getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
// eslint-disable-next-line no-explicit-any
;(globalThis as any).MutationObserver = dom.window.MutationObserver

let passed = 0
let failed = 0
function assert(cond: boolean, name: string) {
  if (cond) {
    passed++
    console.log(`PASS ${name}`)
  } else {
    failed++
    console.log(`FAIL ${name}`)
  }
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const lines = [
  "class Demo01:",
  "    def __new__(cls, *args, **kwargs):",
  "        print('第一步: 执行__new函数')",
  "        instance = super().__new__(cls)",
  "        return instance",
  "",
  "    def __init__(self, name):",
  "        print('第二步: 执行__init函数')",
  "        self.name = name",
  "obj = Demo01('张三')",
]

async function main() {
  const plugin = { eventBus: { on: () => {}, off: () => {} } }
  // eslint-disable-next-line no-explicit-any
  initCodeBlockEnhancer(plugin as any, DEFAULT_SETTINGS)

  const block = document.createElement("div")
  block.className = "code-block"
  const lang = document.createElement("div")
  lang.className = "protyle-action__language"
  lang.textContent = "python"
  const hljs = document.createElement("div")
  hljs.className = "hljs"
  hljs.innerHTML = lines.map(l => `<span>${l}</span>`).join("\n")
  block.appendChild(lang)
  block.appendChild(hljs)
  document.body.appendChild(block)

  await sleep(300) // 首轮 scan

  const snapshot = () => ({
    ellipsis: block.querySelectorAll(".cb-fold-ellipsis").length,
    hljsLines: (hljs.textContent ?? "").split("\n").length,
    rowCount: block.querySelectorAll(".cb-linenumber").length,
    hljsHtmlLen: hljs.innerHTML.length,
  })

  const before = snapshot()
  console.log("before:", JSON.stringify(before))

  // 折叠 __new__
  toggleFold(block, 1)
  await sleep(300)
  const s1 = snapshot()
  console.log("after fold +300ms:", JSON.stringify(s1))
  await sleep(1000)
  const s2 = snapshot()
  console.log("+1000ms:", JSON.stringify(s2))
  await sleep(2000)
  const s3 = snapshot()
  console.log("+2000ms:", JSON.stringify(s3))

  // 关键断言：折叠后内容不再增长
  assert(s1.ellipsis === 1, `省略行稳定为 1 (got ${s1.ellipsis})`)
  assert(s2.ellipsis === s1.ellipsis, "省略行数量不增长")
  assert(s3.ellipsis === s1.ellipsis, "省略行数量持续稳定")
  assert(s3.hljsHtmlLen === s2.hljsHtmlLen && s2.hljsHtmlLen === s1.hljsHtmlLen, ".hljs HTML 不再变化")
  assert(s3.rowCount === s2.rowCount && s2.rowCount === s1.rowCount, "行号列行数稳定")

  clearFoldState(block)
  await sleep(500)
  assert((hljs.textContent ?? "") === lines.join("\n"), "清理后文本完整")
  assert(block.querySelectorAll(".cb-fold-ellipsis").length === 0, "省略行已清理")

  unregisterRenderer(block)
  destroyCodeBlockEnhancer()
  console.log(`\n结果: ${passed} passed, ${failed} failed`)
  if (failed > 0) {
    process.exit(1)
  }
}

main()
