/**
 * 通用的 AbortController 管理工具
 * 用于管理与 DOM 元素绑定的异步控制器
 */
export class ControllerManager {
  private map = new WeakMap<HTMLElement, AbortController>()

  /**
   * 获取元素关联的 AbortController
   */
  get(el: HTMLElement): AbortController | undefined {
    return this.map.get(el)
  }

  /**
   * 关联 AbortController 到元素
   */
  set(el: HTMLElement, controller: AbortController): void {
    this.map.set(el, controller)
  }

  /**
   * 删除元素关联的 AbortController
   */
  delete(el: HTMLElement): void {
    this.map.delete(el)
  }

  /**
   * 中止并删除元素关联的 AbortController
   */
  abortAndDelete(el: HTMLElement): void {
    const controller = this.map.get(el)
    if (controller) {
      controller.abort()
      this.map.delete(el)
    }
  }
}
