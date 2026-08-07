/**
 * Overlay 层：插件注入元素的兄弟容器（污染根治）。
 *
 * 所有视觉装饰元素（统计角标/长代码条/收起按钮等）挂在 codeBlock 的
 * 「兄弟 overlay」上，而不是 codeBlock 内部——否则思源序列化代码块内容
 * （updateTransaction 读 element.outerHTML）时会把装饰 DOM 写进文档，
 * 永久污染用户代码。
 *
 * 定位方案：overlay 插到 codeBlock 的父容器内、codeBlock 之前（兄弟）：
 * - 不在 codeBlock 内部 → outerHTML 序列化不带走（不污染）
 * - 在 codeBlock 之前 → 思源块框选从 codeBlock 开始向后（nextElementSibling）
 *   遍历兄弟链，不会回头经过前面的 overlay（不闪烁）
 * - 与 codeBlock 同父 → transform 用 offsetTop/offsetLeft 相对同一 offsetParent
 *   的差值，即精确位置（无嵌套/滚动坐标系问题）
 * - 滚动时父容器内容一起移动，差值不变 → transform 无需更新（零浮动）
 * - 同生共死：clip-path: inset() 裁剪到与代码块相同的可视区；完全滚出时隐藏
 * - ResizeObserver 跟随尺寸变化（折叠/编辑导致的行高变化）
 */
const overlayMap = new WeakMap<HTMLElement, HTMLElement>()
/** 每个 codeBlock 对应的滚动容器（.protyle-content），缓存避免每帧 closest */
const scrollerMap = new WeakMap<HTMLElement, HTMLElement | null>()
/** 活跃的 codeBlock 集合（WeakMap 不可遍历，滚动/清理时需要遍历） */
const activeBlocks = new Set<HTMLElement>()
/** overlay 相对锚定容器的偏移（布局变化时重算；滚动时不变，原生跟随） */
const staticOffsets = new WeakMap<HTMLElement, {
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
  // 观察父容器：上方内容增删/折叠/懒加载导致块位置变化时重新定位
  const parent = codeBlock.parentElement
  if (parent) {
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

/** 块是否在滚动容器可视区（滚动裁剪判定，两处共用） */
function isBlockVisible(g: OverlayGeom): boolean {
  if (!g.scrollerRect) {
    return true
  }
  return g.blockRect.bottom > g.scrollerRect.top
    && g.blockRect.top < g.scrollerRect.bottom
    && g.blockRect.right > g.scrollerRect.left
    && g.blockRect.left < g.scrollerRect.right
}

function readGeom(codeBlock: HTMLElement): OverlayGeom {
  const scroller = scrollerMap.get(codeBlock)
  return {
    blockRect: codeBlock.getBoundingClientRect(),
    scrollerRect: scroller ? scroller.getBoundingClientRect() : null,
  }
}

/** 写入去重辅助：值相同则跳过（避免无意义 DOM 写触发重绘） */
function setStyle(el: HTMLElement, prop: "left" | "top" | "width" | "height" | "clipPath" | "visibility", value: string) {
  if (el.style[prop] !== value) {
    el.style[prop] = value
  }
}

function applyGeom(ov: HTMLElement, g: OverlayGeom) {
  const {
    blockRect,
    scrollerRect,
  } = g
  // 位置：overlay 锚定 .protyle-wysiwyg（滚动内容），transform 表达
  // codeBlock 相对锚定容器的偏移——滚动时该偏移不变（overlay 与 codeBlock
  // 一起随内容原生移动），transform 无需更新 → 零浮动零计算。
  // （getOverlay 创建时必写 staticOffsets，此处恒有值，无 fallback 分支）
  const offset = staticOffsets.get(ov)!
  const x = offset.left
  const y = offset.top
  const t = `translate(${x}px, ${y}px)`
  if (ov.style.transform !== t) {
    ov.style.transform = t
  }
  // 尺寸：transform 不改变布局尺寸，width/height 仍需真实值（内部元素绝对定位依赖）
  setStyle(ov, "width", `${blockRect.width}px`)
  setStyle(ov, "height", `${blockRect.height}px`)
  // 同生共死：裁剪到与代码块相同的可视区（滚动时随视口坐标更新）
  if (!scrollerRect) {
    setStyle(ov, "clipPath", "")
    setStyle(ov, "visibility", "")
    return
  }
  if (!isBlockVisible(g)) {
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
  // 布局变化（ResizeObserver 触发）时重算偏移：overlay 与 codeBlock 同父，
  // offsetTop/offsetLeft 相对同一 offsetParent，差值即精确位置
  staticOffsets.set(ov, {
    left: codeBlock.offsetLeft - ov.offsetLeft,
    top: codeBlock.offsetTop - ov.offsetTop,
  })
  applyGeom(ov, readGeom(codeBlock))
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
  const jobs: Array<[HTMLElement, OverlayGeom]> = []
  const farAway: Array<[HTMLElement, HTMLElement]> = []
  // 阶段 1：批量读真实几何（一次回流）
  for (const cb of activeBlocks) {
    const ov = overlayMap.get(cb)
    if (!cb.isConnected || !ov?.isConnected) {
      continue
    }
    const g = readGeom(cb)
    if (isBlockVisible(g)) {
      jobs.push([ov, g])
    } else {
      farAway.push([cb, ov])
    }
  }
  // 阶段 2：批量写（可见块定位 + 不可见块隐藏，避免残留在上次位置）
  for (const [ov, g] of jobs) {
    applyGeom(ov, g)
  }
  for (const [, ov] of farAway) {
    setStyle(ov, "visibility", "hidden")
  }
}

/**
 * wheel 转发：overlay 覆盖在代码块上，其可交互子元素（长代码按钮等）
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
    // 记录所属代码块 id：孤儿清理时据此判断 overlay 是否仍对应存在的代码块
    // （overlay 插在 wysiwyg 最前面，无法用兄弟关系判断归属）
    const ownerId = codeBlock.getAttribute("data-node-id")
    if (ownerId) {
      ov.setAttribute("data-cb-owner", ownerId)
    }
    // overlay 必须完全透明于浏览器 selection 系统：
    // - 不加 contenteditable="false"：不可编辑区域是 selection 强制边界，拖选
    //   代码文本越出 .hljs 时 selection 被收缩/重定位 → 思源进入框选模式 →
    //   反复加 protyle-wysiwyg--select（闪烁，用户时间线实测）
    // - 不加 user-select: none：同样是「不可选边界」
    // 只靠 pointer-events: none 隔离鼠标交互；overlay 是纯视觉层。
    ov.style.position = "absolute"
    ov.style.left = "0"
    ov.style.top = "0"
    ov.style.pointerEvents = "none"
    // 注意：不给 overlay 容器加 user-select: none——作为代码块兄弟节点的覆盖层，
    // user-select:none 会让浏览器把 overlay 覆盖区域当作「不可选边界」，
    // 拖选代码文本越出 .hljs 时 selection 被吸附/扩展异常 → 思源触发块级选中。
    // 各装饰子元素（高亮/角标/按钮）自身的 user-select:none 已足够。
    // 裁剪内部装饰到 overlay 盒：高亮在长代码内部滚动时
    // 用 transform 上移，可能超出 overlay 顶部穿透到上方代码块——overflow
    // hidden 把移出的部分裁掉，杜绝「下方块内容显示到上方块」的穿透
    ov.style.overflow = "hidden"
    const parent = codeBlock.parentElement
    // 关键：overlay 插到 codeBlock 的「父容器内、codeBlock 之前」（兄弟）。
    // - 不在 codeBlock 内部 → 思源 outerHTML 序列化不会带走它（不污染）
    // - 在 codeBlock 之前 → 思源块框选从 codeBlock 开始向后遍历 nextElementSibling，
    //   不会回头经过前面的 overlay（不闪烁）
    // - 与 codeBlock 同父 → transform 用 codeBlock.offsetTop/offsetLeft 相对
    //   同一 offsetParent，差值即精确位置（无嵌套/滚动坐标系问题）
    if (parent) {
      parent.insertBefore(ov, codeBlock)
    }
    overlayMap.set(codeBlock, ov)
    activeBlocks.add(codeBlock)
    scrollerMap.set(codeBlock, codeBlock.closest<HTMLElement>(".protyle-content"))
    // 记录 codeBlock 相对 overlay 的布局偏移（transform 基准）。
    // overlay 与 codeBlock 同父（absolute left:0 top:0），两者 offsetParent
    // 相同 → offsetTop/offsetLeft 差值即精确位置。滚动时父容器内容一起移动，
    // 差值不变 → transform 无需更新（零浮动零计算）。
    staticOffsets.set(ov, {
      left: codeBlock.offsetLeft - ov.offsetLeft,
      top: codeBlock.offsetTop - ov.offsetTop,
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
