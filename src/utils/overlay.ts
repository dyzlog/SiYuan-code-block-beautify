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
/** overlay 的静态视口位置缓存（创建时记录，transform 前的位置，供定位基准） */
const staticPositions = new WeakMap<HTMLElement, {
  left: number
  top: number
}>()
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
      // 父容器尺寸变化（上方内容增删/折叠/懒加载）→ 重新定位子块 overlay
      if (!cb.classList.contains("cb-overlay") && !cb.matches(".code-block")) {
        for (const child of cb.querySelectorAll<HTMLElement>(".code-block")) {
          const ov = overlayMap.get(child)
          if (child.isConnected && ov?.isConnected) {
            syncOverlay(child, ov)
          }
        }
        continue
      }
      const ov = overlayMap.get(cb)
      if (cb.isConnected && ov?.isConnected) {
        // 布局变化后重新定位
        syncOverlay(cb, ov)
      }
    }
  })
}

/** 开始观察某代码块及其父容器（布局/内容变化时重新定位 overlay） */
function observeBlockResize(codeBlock: HTMLElement) {
  ensureSharedResizeObserver()
  sharedResizeObserver?.observe(codeBlock)
  // 观察父容器：上方内容增删/折叠/懒加载导致块位置变化时，刷新 offsetTop 缓存
  const parent = codeBlock.parentElement
  if (parent && !parent.classList.contains("cb-overlay")) {
    sharedResizeObserver?.observe(parent)
  }
}

/** 停止观察某代码块 */
function unobserveBlockResize(codeBlock: HTMLElement) {
  sharedResizeObserver?.unobserve(codeBlock)
}

/** 一次读取 overlay 同步所需的全部几何信息（读阶段，触发一次回流） */
interface OverlayGeom {
  blockRect: DOMRect
  scrollerRect: DOMRect | null
}

function readGeom(codeBlock: HTMLElement): OverlayGeom {
  const scroller = scrollerMap.get(codeBlock)
  return {
    blockRect: codeBlock.getBoundingClientRect(),
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

function applyGeom(codeBlock: HTMLElement, ov: HTMLElement, g: OverlayGeom) {
  const {
    blockRect,
    scrollerRect,
  } = g
  // 位置：transform 相对 overlay 的「静态位置」（创建时记录的初始视口坐标）。
  // 用 blockRect - staticRect：两者都是视口坐标，滚动时同步变化，
  // 差值 = codeBlock 相对 overlay 静态位置的偏移（恒定）→ transform 不变，
  // overlay 随内容滚动天然跟随。静态位置缓存避免「当前 ovRect 自指」错乱，
  // 也不依赖 offsetParent 一致性（offsetTop 差值在列表/嵌套块下坐标系不同会乱位）。
  const staticRect = staticPositions.get(ov)
  let x = 0
  let y = 0
  if (staticRect) {
    x = blockRect.left - staticRect.left
    y = blockRect.top - staticRect.top
  } else {
    // 无静态位置缓存（理论上 getOverlay 创建时必缓存）：退化为相对父容器
    x = codeBlock.offsetLeft - ov.offsetLeft
    y = codeBlock.offsetTop - ov.offsetTop
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

/** 当前帧已同步的块集合（下一帧整体替换新实例，实现自动清空） */
let syncedThisFrame = new WeakSet<HTMLElement>()
let syncFrameScheduled = false

/**
 * 同步单个 overlay（创建/尺寸变化时用，自读自写）。
 * 性能：同一帧内多次调用（如一次增强中 4 个模块各调 getOverlay）只读一次几何，
 * 合并为一次回流——增强不再因重复 getBoundingClientRect 卡顿。
 * 帧末整体替换 WeakSet 实例（旧实例 GC 回收），下一帧重新允许同步，
 * 保证滚动/布局变化时 overlay 位置持续跟随，不会残留。
 */
function syncOverlay(codeBlock: HTMLElement, ov: HTMLElement) {
  // 帧内去重：同帧已同步过该块则跳过（几何未变，重复读纯属浪费）
  if (syncedThisFrame.has(codeBlock)) {
    return
  }
  syncedThisFrame.add(codeBlock)
  if (!syncFrameScheduled) {
    syncFrameScheduled = true
    // 帧末替换 WeakSet 实例 = 清空去重标记（旧实例被 GC），下一帧恢复同步
    requestAnimationFrame(() => {
      syncFrameScheduled = false
      syncedThisFrame = new WeakSet<HTMLElement>()
    })
  }
  applyGeom(codeBlock, ov, readGeom(codeBlock))
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
 * 销毁 overlay 系统：卸载滚动监听 + 断开共享 ResizeObserver + 清空所有状态。
 * 供插件卸载时调用，避免 document 级监听与观察器泄漏。
 */
export function destroyOverlaySystem() {
  if (scrollInstalled) {
    document.removeEventListener("scroll", onScroll, true)
    scrollInstalled = false
  }
  sharedResizeObserver?.disconnect()
  sharedResizeObserver = null
  // 清空全部活跃块（其 overlay DOM 由 removeOverlay 逐个移除）
  for (const cb of activeBlocks) {
    const ov = overlayMap.get(cb)
    if (ov) {
      ov.remove()
      overlayMap.delete(cb)
    }
    scrollerMap.delete(cb)
  }
  activeBlocks.clear()
}

/**
 * 滚动同步：scroll 事件在当前帧绘制前触发，同步更新使 overlay 与代码块
 * 同帧绘制（无 rAF 一帧滞后 → 快速滚动不分离）。
 * 性能：直接对活跃块读真实几何（getBoundingClientRect 视口坐标，天然正确），
 * 批量读后批量写（一次回流）。不做 offsetTop/scrollTop 合成预筛——
 * 那套近似在 .protyle/.protyle-content/.protyle-wysiwyg 多层坐标系下必然出错
 * （曾导致「滚动即消失」：视口内块被误判为远块而隐藏）。
 * 活跃块 = 已增强块（仅用户滚动经过的），长文档滚动不会全量回流。
 */
function onScroll() {
  const jobs: Array<[HTMLElement, HTMLElement, OverlayGeom]> = []
  const farAway: Array<[HTMLElement, HTMLElement]> = []
  // 阶段 1：批量读真实几何（一次回流）
  for (const cb of activeBlocks) {
    const ov = overlayMap.get(cb)
    if (!cb.isConnected || !ov?.isConnected) {
      continue
    }
    const g = readGeom(cb)
    const visible = g.scrollerRect
      ? g.blockRect.bottom > g.scrollerRect.top
      && g.blockRect.top < g.scrollerRect.bottom
      && g.blockRect.right > g.scrollerRect.left
      && g.blockRect.left < g.scrollerRect.right
      : true
    if (visible) {
      jobs.push([cb, ov, g])
    } else {
      farAway.push([cb, ov])
    }
  }
  // 阶段 2：批量写（可见块定位 + 不可见块隐藏，避免残留在上次位置）
  for (const [cb, ov, g] of jobs) {
    applyGeom(cb, ov, g)
  }
  for (const [, ov] of farAway) {
    setStyle(ov, "visibility", "hidden")
  }
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
    // 记录静态位置（此刻无 transform，getBoundingClientRect = 初始视口坐标）
    const staticRect = ov.getBoundingClientRect()
    staticPositions.set(ov, {
      left: staticRect.left,
      top: staticRect.top,
    })
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
