/**
 * Overlay 层：插件注入元素的兄弟容器（污染根治）。
 *
 * 所有视觉装饰元素（行号列/缩进线/统计角标/当前行高亮/长代码条等）
 * 必须挂在 codeBlock 的「兄弟 overlay」上，而不是 codeBlock 内部——
 * 否则思源序列化代码块内容（updateTransaction 读 element.outerHTML）时
 * 会把装饰 DOM 写进文档，永久污染用户代码。
 *
 * 定位方案：position: absolute + 相对 offsetParent 的视口差值。
 * - overlay 与 codeBlock 同父，offsetParent 均为 .protyle（position: relative），
 *   坐标 = 两者视口位置差值
 * - 滚动同步：在 scroll 事件内「同步」更新（scroll 事件在当前帧绘制前触发，
 *   与代码块同帧绘制 → 无 rAF 一帧滞后，快速滚动不分离）；
 *   先批量读 rect 再批量写样式，避免逐块强制回流；
 *   跳过远离视口的块（clip 已隐藏，滚近时 scroll 事件再触发）
 * - 同生共死：CSS overflow 无法裁剪 overlay（containing block 在滚动容器外），
 *   用 clip-path: inset() 精确裁剪到与代码块相同的可视区；
 *   完全滚出时 visibility: hidden
 * - z-index: 1（思源 dialog 用 ++window.siyuan.zIndex 动态递增、从 10 起步，
 *   永远高于 1，因此 overlay 绝不会穿透 dialog/menu）
 * - 不修改任何祖先元素的样式（避免破坏思源原生布局）
 * - ResizeObserver 跟随尺寸变化（折叠/编辑导致的行高变化）
 */
const overlayMap = new WeakMap<HTMLElement, HTMLElement>()
const resizeObservers = new WeakMap<HTMLElement, ResizeObserver>()
/** 每个 codeBlock 对应的滚动容器（.protyle-content），缓存避免每帧 closest */
const scrollerMap = new WeakMap<HTMLElement, HTMLElement | null>()
/** 活跃的 codeBlock 集合（WeakMap 不可遍历，滚动/清理时需要遍历） */
const activeBlocks = new Set<HTMLElement>()

/** 需要从 codeBlock 同步到 overlay 的 CSS 变量（overlay 是 sibling，无法继承） */
const SYNC_VARS = [
  "--cb-linenumber-width",
  "--cb-line-font-size",
  "--cb-font-family",
] as const

/** 一次读取 overlay 同步所需的全部几何信息（读阶段，触发一次回流） */
interface OverlayGeom {
  blockRect: DOMRect
  parentRect: DOMRect | null
  scrollerRect: DOMRect | null
}

function readGeom(codeBlock: HTMLElement, ov: HTMLElement): OverlayGeom {
  const parent = ov.offsetParent
  const scroller = scrollerMap.get(codeBlock)
  return {
    blockRect: codeBlock.getBoundingClientRect(),
    parentRect: parent ? parent.getBoundingClientRect() : null,
    scrollerRect: scroller ? scroller.getBoundingClientRect() : null,
  }
}

/** 应用位置 + 可视裁剪（写阶段，不读布局） */
function applyGeom(codeBlock: HTMLElement, ov: HTMLElement, g: OverlayGeom) {
  const {
    blockRect,
    parentRect,
    scrollerRect,
  } = g
  // 位置：absolute + 相对 offsetParent 的视口差值
  if (parentRect) {
    ov.style.left = `${blockRect.left - parentRect.left}px`
    ov.style.top = `${blockRect.top - parentRect.top}px`
  } else {
    // 兜底（理论上 .protyle 是 relative，offsetParent 恒存在）：文档坐标
    ov.style.left = `${blockRect.left + window.scrollX}px`
    ov.style.top = `${blockRect.top + window.scrollY}px`
  }
  ov.style.width = `${blockRect.width}px`
  ov.style.height = `${blockRect.height}px`
  for (const name of SYNC_VARS) {
    const v = codeBlock.style.getPropertyValue(name)
    if (v) {
      ov.style.setProperty(name, v)
    }
  }
  // 同生共死：裁剪到与代码块相同的可视区
  if (!scrollerRect) {
    ov.style.clipPath = ""
    ov.style.visibility = ""
    return
  }
  const visible = blockRect.bottom > scrollerRect.top
    && blockRect.top < scrollerRect.bottom
    && blockRect.right > scrollerRect.left
    && blockRect.left < scrollerRect.right
  if (!visible) {
    ov.style.visibility = "hidden"
    return
  }
  ov.style.visibility = ""
  const top = Math.max(0, scrollerRect.top - blockRect.top)
  const right = Math.max(0, blockRect.right - scrollerRect.right)
  const bottom = Math.max(0, blockRect.bottom - scrollerRect.bottom)
  const left = Math.max(0, scrollerRect.left - blockRect.left)
  if (top === 0 && right === 0 && bottom === 0 && left === 0) {
    ov.style.clipPath = ""
  } else {
    ov.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px)`
  }
}

/** 同步单个 overlay（创建/尺寸变化时用，自读自写） */
function syncOverlay(codeBlock: HTMLElement, ov: HTMLElement) {
  applyGeom(codeBlock, ov, readGeom(codeBlock, ov))
}

/**
 * 滚动同步：scroll 事件在当前帧绘制前触发，同步更新使 overlay 与代码块
 * 同帧绘制（无 rAF 一帧滞后 → 快速滚动不分离）。
 * 先批量读（一次回流）再批量写；跳过远离视口的块。
 */
function onScroll() {
  const margin = 1000
  const jobs: Array<[HTMLElement, HTMLElement, OverlayGeom]> = []
  // 阶段 1：批量读
  for (const cb of activeBlocks) {
    const ov = overlayMap.get(cb)
    if (!cb.isConnected || !ov?.isConnected) {
      continue
    }
    const g = readGeom(cb, ov)
    if (g.blockRect.bottom < -margin || g.blockRect.top > window.innerHeight + margin) {
      continue
    }
    jobs.push([cb, ov, g])
  }
  // 阶段 2：批量写
  for (const [cb, ov, g] of jobs) {
    applyGeom(cb, ov, g)
  }
}

let scrollInstalled = false
/** 惰性安装滚动监听（捕获阶段：能收到任意容器的 scroll 事件） */
function ensureScrollSync() {
  if (scrollInstalled) {
    return
  }
  scrollInstalled = true
  document.addEventListener("scroll", onScroll, true)
}

/**
 * wheel 转发：overlay 覆盖在代码块上，其可交互子元素（折叠箭头/长代码按钮）
 * 会拦截滚轮事件。这里把滚动量转发给最近的滚动容器 .protyle-content，
 * 保证鼠标停在按钮上时滚轮依然滚动文档。
 */
function ensureWheelForward(codeBlock: HTMLElement, ov: HTMLElement) {
  ov.addEventListener("wheel", (e: WheelEvent) => {
    const scroller = codeBlock.closest<HTMLElement>(".protyle-content")
    if (!scroller) {
      return
    }
    e.preventDefault()
    scroller.scrollTop += e.deltaY
    scroller.scrollLeft += e.deltaX
  }, { passive: false })
}

/**
 * 获取（或创建）codeBlock 的 overlay 容器。
 * 创建时自动定位 + 监听尺寸变化与滚动；重复调用幂等。
 * 不修改任何祖先元素的样式（避免破坏思源原生布局）。
 */
export function getOverlay(codeBlock: HTMLElement): HTMLElement {
  let ov = overlayMap.get(codeBlock)
  if (!ov || !ov.isConnected) {
    ov = document.createElement("div")
    ov.className = "cb-overlay"
    ov.setAttribute("contenteditable", "false")
    ov.style.position = "absolute"
    ov.style.pointerEvents = "none"
    const parent = codeBlock.parentElement
    if (parent) {
      parent.insertBefore(ov, codeBlock.nextSibling)
    }
    overlayMap.set(codeBlock, ov)
    activeBlocks.add(codeBlock)
    scrollerMap.set(codeBlock, codeBlock.closest<HTMLElement>(".protyle-content"))
    ensureWheelForward(codeBlock, ov)
    // 尺寸变化（折叠展开/编辑行高变化）自动跟随
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(() => {
        if (codeBlock.isConnected && ov.isConnected) {
          syncOverlay(codeBlock, ov)
        }
      })
      ro.observe(codeBlock)
      resizeObservers.set(codeBlock, ro)
    }
    ensureScrollSync()
  }
  syncOverlay(codeBlock, ov)
  return ov
}

/**
 * 移除 codeBlock 的 overlay（含其中全部注入元素）并断开观察器。
 * 供增强清理 / 卸载时调用。
 */
export function removeOverlay(codeBlock: HTMLElement) {
  const ro = resizeObservers.get(codeBlock)
  if (ro) {
    ro.disconnect()
    resizeObservers.delete(codeBlock)
  }
  activeBlocks.delete(codeBlock)
  scrollerMap.delete(codeBlock)
  const ov = overlayMap.get(codeBlock)
  if (ov) {
    ov.remove()
    overlayMap.delete(codeBlock)
  }
}
