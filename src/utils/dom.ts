/**
 * 代码块美化插件 - 公共 DOM 能力检测
 */

/** 浏览器是否支持 translate 独立合成属性（支持则优先使用，性能更好） */
export const SUPPORTS_TRANSLATE = "translate" in document.documentElement.style

/** 代码块增强标记（dataset.cbEnhanced 的值） */
export const ENHANCED_VALUE = "1"

/** 遍历根节点下所有文本节点 */
export function forEachTextNode(root: Node, cb: (text: Text) => void) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode() as Text | null
  while (node) {
    cb(node)
    node = walker.nextNode() as Text | null
  }
}

/** 设置元素的滚动平移偏移（优先 translate 独立属性，回退 transform） */
export function setScrollOffset(el: HTMLElement, y: number) {
  if (SUPPORTS_TRANSLATE) {
    const next = `0 ${y}px`
    if (el.style.translate !== next) {
      el.style.translate = next
    }
  } else {
    const next = `translateY(${y}px)`
    if (el.style.transform !== next) {
      el.style.transform = next
    }
  }
}
