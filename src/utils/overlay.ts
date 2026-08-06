/**
 * Overlay 层：插件注入元素的兄弟容器（污染根治）。
 *
 * 所有视觉装饰元素（行号列/统计角标/当前行高亮/长代码条等）
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
/** 每个 codeBlock 对应的滚动容器（.protyle-content），缓存避免每帧 closest */
const scrollerMap = new WeakMap<HTMLElement, HTMLElement | null>()
/** 活跃的 codeBlock 集合（WeakMap 不可遍历，滚动/清理时需要遍历） */
const activeBlocks = new Set<HTMLElement>()
/** 共享 ResizeObserver（单实例观察所有增强块，替代每块一个 RO） */
let sharedResizeObserver: ResizeObserver | null = null

/** 确保共享 RO 已创建（惰性） */
function ensureSharedResizeObserver() {
  if (sharedResizeObserver) {
    return
  }
  sharedResizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const cb = entry.target as HTMLElement
      const ov = overlayMap.get(cb)
      if (cb.isConnected && ov?.isConnected) {
        // 布局变化后刷新 offsetTop 缓存 + 重新定位
        cacheBlockOffset(cb)
        syncOverlay(cb, ov)
      }
    }
  })
}

/** 开始观察某代码块（布局变化时重新定位 overlay） */
function observeBlockResize(codeBlock: HTMLElement) {
  ensureSharedResizeObserver()
  sharedResizeObserver?.observe(codeBlock)
}

/** 停止观察某代码块 */
function unobserveBlockResize(codeBlock: HTMLElement) {
  sharedResizeObserver?.unobserve(codeBlock)
}

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
/** 写入去重辅助：值相同则跳过（避免无意义 DOM 写触发重绘） */
function setStyle(el: HTMLElement, prop: "left" | "top" | "width" | "height" | "clipPath" | "visibility", value: string) {
  if (el.style[prop] !== value) {
    el.style[prop] = value
  }
}

function applyGeom(_codeBlock: HTMLElement, ov: HTMLElement, g: OverlayGeom) {
  const {
    blockRect,
    parentRect,
    scrollerRect,
  } = g
  // 位置：absolute 固定在 offsetParent 原点，用 transform 平移表达实际位置——
  // transform 走合成层不触发回流（滚动只做 GPU 合成，长文档滚动不卡）
  let x: number
  let y: number
  if (parentRect) {
    x = blockRect.left - parentRect.left
    y = blockRect.top - parentRect.top
  } else {
    // 兜底（理论上 .protyle 是 relative，offsetParent 恒存在）：文档坐标
    x = blockRect.left + window.scrollX
    y = blockRect.top + window.scrollY
  }
  const t = `translate(${x}px, ${y}px)`
  if (ov.style.transform !== t) {
    ov.style.transform = t
  }
  // 尺寸：transform 不改变布局尺寸，width/height 仍需真实值（内部元素绝对定位依赖）
  setStyle(ov, "width", `${blockRect.width}px`)
  setStyle(ov, "height", `${blockRect.height}px`)
  // 同生共死：裁剪到与代码块相同的可视区
  if (!scrollerRect) {
    setStyle(ov, "clipPath", "")
    setStyle(ov, "visibility", "")
    return
  }
  const visible = blockRect.bottom > scrollerRect.top
    && blockRect.top < scrollerRect.bottom
    && blockRect.right > scrollerRect.left
    && blockRect.left < scrollerRect.right
  if (!visible) {
    // 完全滚出视口：隐藏且不再写位置（不可见，位置无意义）
    setStyle(ov, "visibility", "hidden")
    return
  }
  setStyle(ov, "visibility", "")
  const top = Math.max(0, scrollerRect.top - blockRect.top)
  const right = Math.max(0, blockRect.right - scrollerRect.right)
  const bottom = Math.max(0, blockRect.bottom - scrollerRect.bottom)
  const left = Math.max(0, scrollerRect.left - blockRect.left)
  const clip = (top === 0 && right === 0 && bottom === 0 && left === 0)
    ? ""
    : `inset(${top}px ${right}px ${bottom}px ${left}px)`
  setStyle(ov, "clipPath", clip)
}

/** 帧内已同步的块（避免同一次增强中多次 getOverlay → 重复读几何/回流） */
const syncedThisFrame = new WeakSet<HTMLElement>()
let syncFrameScheduled = false

/**
 * 同步单个 overlay（创建/尺寸变化时用，自读自写）。
 * 性能：同一帧内多次调用（如一次增强中 4 个模块各调 getOverlay）只读一次几何，
 * 合并为一次回流——增强不再因重复 getBoundingClientRect 卡顿。
 */
function syncOverlay(codeBlock: HTMLElement, ov: HTMLElement) {
  // 帧内去重：同帧已同步过该块则跳过（几何未变，重复读纯属浪费）
  if (syncedThisFrame.has(codeBlock)) {
    return
  }
  syncedThisFrame.add(codeBlock)
  if (!syncFrameScheduled) {
    syncFrameScheduled = true
    // 帧末清空标记，下一帧允许重新同步（块可能已移动）
    requestAnimationFrame(() => {
      syncFrameScheduled = false
    })
  }
  applyGeom(codeBlock, ov, readGeom(codeBlock, ov))
}

/** 缓存每个块的文档偏移（offsetTop 相对 offsetParent，滚动时恒定；创建时读一次避免每帧回流） */
const cachedOffsetTop = new WeakMap<HTMLElement, number>()

/** 记录/更新块的文档偏移缓存（getOverlay 创建时调用） */
function cacheBlockOffset(codeBlock: HTMLElement) {
  cachedOffsetTop.set(codeBlock, codeBlock.offsetTop)
}

/**
 * 滚动同步：scroll 事件在当前帧绘制前触发，同步更新使 overlay 与代码块
 * 同帧绘制（无 rAF 一帧滞后 → 快速滚动不分离）。
 * 性能：用缓存的 offsetTop（滚动时恒定，无需每帧读）+ scrollTop 估算块位置，
 * 只对接近视口的块执行 getBoundingClientRect（长文档滚动不全量回流）。
 */
function onScroll() {
  const margin = 1000
  const jobs: Array<[HTMLElement, HTMLElement, OverlayGeom]> = []
  const first = [...activeBlocks][0]
  const scroller = first ? scrollerMap.get(first) : null
  const scrollTop = scroller?.scrollTop ?? 0
  const viewH = window.innerHeight
  // 阶段 1a：廉价预筛（读缓存 offsetTop + scrollTop，均不触发回流）
  const candidates: HTMLElement[] = []
  for (const cb of activeBlocks) {
    const ov = overlayMap.get(cb)
    if (!cb.isConnected || !ov?.isConnected) {
      continue
    }
    const docTop = cachedOffsetTop.get(cb) ?? cb.offsetTop
    const approxTop = docTop - scrollTop
    if (approxTop > -margin && approxTop < viewH + margin) {
      candidates.push(cb)
    }
  }
  // 阶段 1b：仅对候选块读几何（一次回流）
  for (const cb of candidates) {
    const ov = overlayMap.get(cb)
    if (!ov) {
      continue
    }
    jobs.push([cb, ov, readGeom(cb, ov)])
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
    ov.style.left = "0"
    ov.style.top = "0"
    ov.style.pointerEvents = "none"
    const parent = codeBlock.parentElement
    if (parent) {
      parent.insertBefore(ov, codeBlock.nextSibling)
    }
    overlayMap.set(codeBlock, ov)
    activeBlocks.add(codeBlock)
    scrollerMap.set(codeBlock, codeBlock.closest<HTMLElement>(".protyle-content"))
    cacheBlockOffset(codeBlock)
    ensureWheelForward(codeBlock, ov)
    // 位置/尺寸变化自动跟随：共享 ResizeObserver 观察该块（布局变化时重新定位）
    if ("ResizeObserver" in window) {
      observeBlockResize(codeBlock)
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
  unobserveBlockResize(codeBlock)
  activeBlocks.delete(codeBlock)
  scrollerMap.delete(codeBlock)
  const ov = overlayMap.get(codeBlock)
  if (ov) {
    ov.remove()
    overlayMap.delete(codeBlock)
  }
}
