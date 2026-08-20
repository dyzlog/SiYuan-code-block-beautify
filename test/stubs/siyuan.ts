/**
 * 测试用 siyuan API 桩：siyuan 是思源宿主在运行时注入的外部依赖，
 * 单元测试无法真实加载，这里提供最小实现供 DOM 相关测试解析。
 */
export const fetchSyncPost = (): Promise<{ code: number }> => Promise.resolve({ code: 0 })
export const getFrontend = (): string => "desktop"
export const showMessage = (): void => {}
export class Plugin {
  public eventBus: { on: () => void, off: () => void } = {
    on: () => {},
    off: () => {},
  }

  /** 插件数据存储（内存模拟，供 loadData/saveData 测试） */
  private storage: Record<string, unknown> = {}

  public loadData<T>(name: string): Promise<T | null> {
    return Promise.resolve((this.storage[name] as T) ?? null)
  }

  public saveData(name: string, data: unknown): Promise<void> {
    this.storage[name] = data
    return Promise.resolve()
  }
}
export class Dialog {
  public element: HTMLElement = document.createElement("div")
  public destroy(): void {}
}
