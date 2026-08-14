# 代码优化工具库 - 使用指南

## 概述

本文档介绍了在代码整理过程中创建的三个新工具模块，这些模块可以显著减少代码重复，提高代码质量。

---

## 1. ControllerManager - 异步控制器管理

**位置**：`src/utils/controller-manager.ts`

### 用途
统一管理与 DOM 元素绑定的 `AbortController` 实例，简化异步操作的生命周期管理。

### API

```typescript
class ControllerManager {
  // 获取元素关联的 AbortController
  get(el: HTMLElement): AbortController | undefined
  
  // 关联 AbortController 到元素
  set(el: HTMLElement, controller: AbortController): void
  
  // 删除元素关联
  delete(el: HTMLElement): void
  
  // 中止并删除元素关联（最常用）
  abortAndDelete(el: HTMLElement): void
}
```

### 使用示例

#### ? 不使用工具（冗长）
```typescript
const controllers = new WeakMap<HTMLElement, AbortController>()

function setupListener(element: HTMLElement) {
  // 清理旧的
  controllers.get(element)?.abort()
  controllers.delete(element)
  
  // 创建新的
  const ac = new AbortController()
  controllers.set(element, ac)
  
  element.addEventListener("click", handler, { signal: ac.signal })
}

function cleanup(element: HTMLElement) {
  controllers.get(element)?.abort()
  controllers.delete(element)
}
```

#### ? 使用 ControllerManager（简洁）
```typescript
const controllers = new ControllerManager()

function setupListener(element: HTMLElement) {
  controllers.abortAndDelete(element)  // 一行清理
  
  const ac = new AbortController()
  controllers.set(element, ac)
  
  element.addEventListener("click", handler, { signal: ac.signal })
}

function cleanup(element: HTMLElement) {
  controllers.abortAndDelete(element)  // 一行清理
}
```

### 最佳实践

1. 为每个异步管理场景创建一个 `ControllerManager` 实例
2. 在清理函数中使用 `abortAndDelete()`，既处理中止又删除关联
3. 支持 WeakMap 自动垃圾回收（元素 DOM 移除后自动清理）

---

## 2. DOM 操作工具函数

**位置**：`src/utils/dom-helpers.ts`

### 工具函数

#### `replaceClassByPrefix(element, prefix, newClass)`

移除所有带指定前缀的 CSS class，然后添加新 class。

**参数**：
- `element`: HTMLElement - 目标元素
- `prefix`: string - class 前缀（如 `"cb-theme-"`）
- `newClass`: string | null | undefined - 新 class 名（不含前缀，可空）

**示例**：
```typescript
import { replaceClassByPrefix } from "@/utils/dom-helpers"

const root = document.documentElement

// 移除所有 "cb-theme-" 前缀的 class，添加新的 "mac" 主题
replaceClassByPrefix(root, "cb-theme-", "mac")
// 结果：移除 "cb-theme-windows", "cb-theme-chrome" 等，添加 "cb-theme-mac"

// 移除所有 "cb-theme-" 前缀的 class（不添加新的）
replaceClassByPrefix(root, "cb-theme-", null)
// 结果：所有带 "cb-theme-" 前缀的 class 都被移除
```

#### `createEl<K>(tag, options?)`

创建 DOM 元素，支持类名、文本内容、子元素和 HTML。

**参数**：
- `tag`: keyof HTMLElementTagNameMap - HTML 标签名（带类型检查）
- `options?`: 
  - `className`: string | string[] - CSS 类名（支持数组）
  - `textContent`: string - 文本内容
  - `children`: Element[] - 子元素
  - `html`: string - HTML 内容

**示例**：
```typescript
import { createEl } from "@/utils/dom-helpers"

// 创建简单元素
const div = createEl("div", { className: "container" })

// 创建多 class 元素
const btn = createEl("button", { 
  className: ["btn", "btn-primary"], 
  textContent: "点击我" 
})

// 创建复杂结构
const header = createEl("header", { className: "app-header" })
const title = createEl("h1", { textContent: "标题" })
const subtitle = createEl("p", { textContent: "副标题" })
header.appendChild(title)
header.appendChild(subtitle)

// 更简洁的方式
const header2 = createEl("header", {
  className: "app-header",
  children: [
    createEl("h1", { textContent: "标题" }),
    createEl("p", { textContent: "副标题" })
  ]
})
```

#### `removeAll(parent, selector)`

移除匹配选择器的所有元素。

**参数**：
- `parent`: Element - 搜索范围
- `selector`: string - CSS 选择器

**示例**：
```typescript
import { removeAll } from "@/utils/dom-helpers"

// 移除所有 .warning 类的元素
removeAll(document.body, ".warning")

// 移除复杂选择器
removeAll(container, ".old-theme, .deprecated-style, [data-temp]")
```

#### `ensureElement<K>(parent, tag, className)`

获取或创建指定类名的元素。

**参数**：
- `parent`: HTMLElement - 父元素
- `tag`: keyof HTMLElementTagNameMap - 标签名
- `className`: string - CSS 类名

**示例**：
```typescript
import { ensureElement } from "@/utils/dom-helpers"

// 如果不存在 .status-bar，则创建；否则返回既有的
const statusBar = ensureElement(container, "div", "status-bar")
statusBar.textContent = "Ready"

// 第二次调用返回同一个元素
const same = ensureElement(container, "div", "status-bar")
console.log(statusBar === same)  // true
```

### 最佳实践

1. **createEl 与子元素**：优先在创建时传入 `children`，而不是逐个 appendChild
2. **replaceClassByPrefix**：用于需要频繁切换主题/风格的场景
3. **removeAll**：避免手写 `querySelectorAll().forEach()` 模式
4. **ensureElement**：用于单例模式的 DOM 元素（如工具栏、状态栏）

---

## 3. 事件管理器

**位置**：`src/utils/event-manager.ts`

### 用途
统一管理事件监听器的添加和清理，防止内存泄漏。

### API

```typescript
class EventManager {
  // 添加事件监听器并记录
  on(
    target: EventTarget,
    event: string,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions
  ): void
  
  // 移除特定事件监听器
  off(target: EventTarget, event: string, handler: EventListener): void
  
  // 清理所有记录的事件监听器
  clear(): void
  
  // 获取已记录的监听器数量
  get size(): number
}
```

### 使用示例

```typescript
import { EventManager } from "@/utils/event-manager"

class CodeBlockEnhancer {
  private eventManager = new EventManager()
  
  private hljs: HTMLElement
  private codeBlock: HTMLElement
  
  initialize() {
    // 添加事件监听
    this.eventManager.on(
      this.hljs,
      "scroll",
      () => this.onScroll(),
      { passive: true }
    )
    
    this.eventManager.on(
      document,
      "selectionchange",
      () => this.onSelectionChange()
    )
    
    this.eventManager.on(
      this.codeBlock,
      "click",
      (e) => this.handleClick(e)
    )
  }
  
  private onScroll() {
    // 处理滚动
  }
  
  private onSelectionChange() {
    // 处理选择变化
  }
  
  private handleClick(e: Event) {
    // 处理点击
  }
  
  // 清理时一行搞定
  cleanup() {
    this.eventManager.clear()
  }
}
```

### 最佳实践

1. 为每个模块/类创建一个 `EventManager` 实例
2. 在模块卸载时调用 `clear()` 清理所有监听器
3. 使用 `size` 属性进行调试和性能监控
4. 避免同一 handler 重复添加（调用方自己保证）

---

## 总体使用建议

### 何时使用这些工具

| 工具 | 适用场景 |
|------|--------|
| `ControllerManager` | 需要与多个 DOM 元素绑定 AbortController |
| `createEl` | 创建多个相似的 DOM 元素 |
| `replaceClassByPrefix` | 切换主题/风格类 |
| `removeAll` | 清理一组相关的 DOM 元素 |
| `EventManager` | 管理复杂的事件监听器生命周期 |

### 代码示例整合

```typescript
import { createEl, replaceClassByPrefix, removeAll } from "@/utils/dom-helpers"
import { ControllerManager } from "@/utils/controller-manager"
import { EventManager } from "@/utils/event-manager"

class CodeBlockDecorator {
  private controllers = new ControllerManager()
  private eventManager = new EventManager()
  
  decorate(codeBlock: HTMLElement, theme: string) {
    const hljs = codeBlock.querySelector<HTMLElement>(".hljs")
    if (!hljs) return
    
    // 创建装饰元素
    const bar = createEl("div", { className: "decoration-bar" })
    const dots = createEl("div", { 
      className: "dots",
      children: [
        createEl("span", { className: "dot dot-red" }),
        createEl("span", { className: "dot dot-yellow" }),
        createEl("span", { className: "dot dot-green" })
      ]
    })
    bar.appendChild(dots)
    codeBlock.insertBefore(bar, hljs)
    
    // 应用主题
    replaceClassByPrefix(codeBlock, "theme-", theme)
    
    // 管理监听器
    const ac = new AbortController()
    this.controllers.set(codeBlock, ac)
    
    this.eventManager.on(
      hljs,
      "scroll",
      () => this.handleScroll(bar),
      { signal: ac.signal }
    )
  }
  
  private handleScroll(bar: HTMLElement) {
    bar.classList.add("scrolling")
  }
  
  cleanup(codeBlock: HTMLElement) {
    this.controllers.abortAndDelete(codeBlock)
    removeAll(codeBlock, ".decoration-bar")
    this.eventManager.clear()
  }
}
```

---

## 性能考虑

### 内存管理

- `ControllerManager` 使用 WeakMap，元素删除后自动垃圾回收
- `EventManager` 保持强引用，必须手动 `clear()` 才能释放

### 性能影响

- 工具函数是轻量级包装，性能开销可忽略不计
- 实际上通过减少重复代码可能提升 bundle 大小压缩效率

---

## 常见陷阱

### ?? 错误用法

```typescript
// 错误 1：忘记 clear() 导致内存泄漏
const eventManager = new EventManager()
eventManager.on(element, "click", handler)
// ... element 被移除 ...
// 监听器仍然存在！

// 错误 2：混淆 on() 和 addEventListener() 的 options 参数
eventManager.on(element, "scroll", handler)  // 不记录在 eventManager 中
element.addEventListener("scroll", handler)  // 外部添加的监听器

// 错误 3：重复调用 abortAndDelete()
controllers.abortAndDelete(element)
controllers.abortAndDelete(element)  // 第二次调用是幂等的，不会出错
```

### ? 正确用法

```typescript
// 正确 1：确保 clear()
const eventManager = new EventManager()
try {
  eventManager.on(element, "click", handler)
} finally {
  eventManager.clear()
}

// 正确 2：统一管理
const eventManager = new EventManager()
element.addEventListener("scroll", handler, { passive: true })
// 外部添加的不经过 eventManager

// 正确 3：幂等操作
controllers.abortAndDelete(element)  // 安全，无副作用
```

---

## 贡献指南

如果需要添加新的工具函数：

1. 在相应的工具模块中添加函数
2. 添加 JSDoc 注释说明用途、参数和返回值
3. 添加单元测试
4. 在本文档中更新 API 章节

---

## 相关文件

- [优化总结](./OPTIMIZATION_REPORT.md)
- [优化前后对比](./BEFORE_AFTER_COMPARISON.md)
