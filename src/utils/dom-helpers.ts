/**
 * DOM 操作工具函数
 */

/**
 * CSS class 前缀替换工具
 * 移除所有带指定前缀的 class，然后添加新 class
 * @param element - 目标元素
 * @param prefix - class 前缀
 * @param newClass - 新的 class 名（不包含前缀），为空时仅删除旧 class
 */
export function replaceClassByPrefix(
  element: HTMLElement,
  prefix: string,
  newClass: string | null | undefined,
): void {
  // 移除所有带前缀的 class
  Array.from(element.classList).forEach((cls) => {
    if (cls.startsWith(prefix)) {
      element.classList.remove(cls)
    }
  })

  // 添加新 class（如果非空）
  if (newClass) {
    element.classList.add(`${prefix}${newClass}`)
  }
}

/**
 * 创建一个元素，具有可选的类名、文本内容和子元素
 */
export function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options?: {
    className?: string | string[]
    textContent?: string
    children?: Element[]
    html?: string
  },
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)

  if (options?.className) {
    const classes = Array.isArray(options.className)
      ? options.className
      : options.className.split(/\s+/).filter(Boolean)
    if (classes.length) {
      el.classList.add(...classes)
    }
  }

  if (options?.textContent) {
    el.textContent = options.textContent
  }

  if (options?.html) {
    el.innerHTML = options.html
  }

  if (options?.children) {
    el.append(...options.children)
  }

  return el
}

/**
 * 移除所有匹配选择器的元素
 */
export function removeAll(parent: Element, selector: string): void {
  parent.querySelectorAll(selector).forEach((el) => {
    el.remove()
  })
}
