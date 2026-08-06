/**
 * 背景图片管理：上传/读取/删除思源内核存储中的图片。
 * 存储路径：data/storage/petal/code-block-beautify/（随工作空间持久保存）。
 * 注意：思源文件 API 为 POST-only，getFile 需以 XHR 取 blob 后转 objectURL。
 */
import { fetchSyncPost } from "siyuan"
import {
  registerDecor,
} from "./registry"
import { buildSakuraBg } from "./sakura-bg"

const STORAGE_DIR = "data/storage/petal/code-block-beautify"

/** 当前背景图 objectURL（用于回收） */
let currentBgUrl: string | null = null

async function post(url: string, data: unknown): Promise<void> {
  const res = await fetchSyncPost(url, data)
  if (res.code !== 0) {
    throw new Error(res.msg ?? `request failed: ${url}`)
  }
}

/** 以 XHR 获取文件 blob（getFile 是 POST 接口） */
export function fetchFileBlob(path: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/file/getFile")
    xhr.responseType = "blob"
    xhr.setRequestHeader("Content-Type", "application/json")
    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(xhr.response as Blob)
      } else {
        reject(new Error(`getFile failed: ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error("getFile network error"))
    xhr.send(JSON.stringify({ path }))
  })
}

export interface UploadedImage {
  /** 存储文件名 */
  name: string
  /** 完整存储路径（相对工作空间根） */
  path: string
}

function itemPath(name: string): string {
  return `${STORAGE_DIR}/${name}`
}

/** 上传本地图片到插件存储目录（putFile，持久保存） */
export async function uploadBackgroundImage(file: File): Promise<UploadedImage> {
  const safeName = `${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`
  const form = new FormData()
  form.append("path", itemPath(safeName))
  form.append("file", file)
  await post("/api/file/putFile", form)
  return {
    name: safeName,
    path: itemPath(safeName),
  }
}

/** 列出插件存储目录中已上传的图片（readDir，data 为数组） */
export async function listBackgroundImages(): Promise<UploadedImage[]> {
  try {
    const res = await fetchSyncPost("/api/file/readDir", { path: STORAGE_DIR })
    if (res.code !== 0) {
      return []
    }
    const data = res.data as unknown
    const files = Array.isArray(data)
      ? data as Array<{ name: string }>
      : ((data as { files?: Array<{ name: string }> })?.files ?? [])
    return files
      .filter((f) => /\.(?:png|jpe?g|gif|webp|svg)$/i.test(f.name))
      .map((f) => ({
        name: f.name,
        path: itemPath(f.name),
      }))
      .sort((a, b) => b.name.localeCompare(a.name))
  } catch {
    return []
  }
}

/** 删除指定图片（同时删除存储目录中的文件） */
export async function deleteBackgroundImage(name: string): Promise<void> {
  await post("/api/file/removeFile", { path: itemPath(name) })
}

/**
 * 应用背景图片（异步加载 blob → objectURL → 设置 CSS 变量）。
 * @param path 存储路径（空 = 清除背景图片）
 */
export async function applyBackgroundImage(path: string): Promise<void> {
  const root = document.documentElement
  if (!path) {
    root.style.setProperty("--cb-bg-image", "none")
    clearBackgroundImageUrl()
    return
  }
  try {
    const blob = await fetchFileBlob(path)
    clearBackgroundImageUrl()
    currentBgUrl = URL.createObjectURL(blob)
    root.style.setProperty("--cb-bg-image", `url("${currentBgUrl}")`)
  } catch {
    root.style.setProperty("--cb-bg-image", "none")
  }
}

function clearBackgroundImageUrl() {
  if (currentBgUrl) {
    URL.revokeObjectURL(currentBgUrl)
    currentBgUrl = null
  }
}

/**
 * CSS 纹理主题 class 列表（须与 codeblock.scss 中 .cb-bg-* 定义一致）。
 * sakura 为 SVG 背景主题（非 CSS 纹理），单独处理。
 */
export const TEXTURE_CLASSES = [
  "grid",
  "dots",
  "ruled",
  "columns",
  "cross",
  "dotgrid",
  "stripes",
  "notebook",
  "carbon",
  "graph",
].map((t) => `cb-bg-${t}`)

/** SVG 背景主题（用 buildSakuraBg 生成 data URI 作 background-image） */
const SVG_BG_THEMES = new Set(["sakura"])

/** sakura SVG data URI 单例缓存（全文档只生成一次，后续块复用同一 URI，浏览器缓存命中） */
let cachedSakuraUri: string | null = null

/** 获取 sakura 背景 URI（惰性生成 + 缓存） */
function getSakuraUri(): string {
  if (!cachedSakuraUri) {
    cachedSakuraUri = buildSakuraBg()
  }
  return cachedSakuraUri
}

/** 背景纹理主题 class 前缀 */
const BG_CLASS_PREFIX = "cb-bg-"

/**
 * 背景纹理 CSS（按需注入，不在主样式文件全量加载）。
 * key 为主题名，value 为对应纹理 class 的 CSS 规则。
 */
const TEXTURE_CSS: Record<string, string> = {
  grid: `.code-block.cb-beautified.cb-bg-grid{background-image:repeating-linear-gradient(0deg,rgba(0,0,0,.07) 0 1px,transparent 1px 24px),repeating-linear-gradient(90deg,rgba(0,0,0,.07) 0 1px,transparent 1px 24px)}`,
  dots: `.code-block.cb-beautified.cb-bg-dots{background-image:radial-gradient(rgba(0,0,0,.18) 1px,transparent 1px);background-size:18px 18px}`,
  ruled: `.code-block.cb-beautified.cb-bg-ruled{background-image:repeating-linear-gradient(0deg,transparent 0 calc(1.7em - 1px),rgba(0,0,0,.09) calc(1.7em - 1px) 1.7em)}`,
  columns: `.code-block.cb-beautified.cb-bg-columns{background-image:repeating-linear-gradient(90deg,transparent 0 23px,rgba(0,0,0,.08) 23px 24px)}`,
  cross: `.code-block.cb-beautified.cb-bg-cross{background-image:repeating-linear-gradient(0deg,rgba(0,0,0,.05) 0 1px,transparent 1px 16px),repeating-linear-gradient(90deg,rgba(0,0,0,.05) 0 1px,transparent 1px 16px)}`,
  dotgrid: `.code-block.cb-beautified.cb-bg-dotgrid{background-image:radial-gradient(rgba(0,0,0,.14) 1px,transparent 1px);background-size:16px 16px;background-position:8px 8px}`,
  stripes: `.code-block.cb-beautified.cb-bg-stripes{background-image:repeating-linear-gradient(45deg,rgba(0,0,0,.06) 0 1px,transparent 1px 12px)}`,
  notebook: `.code-block.cb-beautified.cb-bg-notebook{background-image:repeating-linear-gradient(0deg,transparent 0 calc(1.7em - 1px),rgba(0,0,0,.07) calc(1.7em - 1px) 1.7em),linear-gradient(90deg,rgba(220,80,80,.35) 0 1px,transparent 1px);background-size:auto,56px 100%;background-position:0 0,0 0}`,
  carbon: `.code-block.cb-beautified.cb-bg-carbon{background-image:repeating-linear-gradient(45deg,rgba(0,0,0,.1) 0 1px,transparent 1px 6px),repeating-linear-gradient(-45deg,rgba(0,0,0,.1) 0 1px,transparent 1px 6px)}`,
  graph: `.code-block.cb-beautified.cb-bg-graph{background-image:repeating-linear-gradient(0deg,rgba(0,0,0,.06) 0 1px,transparent 1px 5px),repeating-linear-gradient(90deg,rgba(0,0,0,.06) 0 1px,transparent 1px 5px)}`,
}

/** 已注入的纹理 style 标签（Set<theme>，避免重复注入） */
const injectedStyles = new Set<string>()

/** 按需注入某主题的纹理 CSS（惰性，首次使用时注入一个 <style>） */
function ensureTextureStyle(theme: string) {
  const css = TEXTURE_CSS[theme]
  if (!css || injectedStyles.has(theme)) {
    return
  }
  injectedStyles.add(theme)
  const style = document.createElement("style")
  style.setAttribute("data-cb-texture", theme)
  style.textContent = css
  document.head.appendChild(style)
}

/**
 * 应用背景主题：CSS 纹理走 class 注入；SVG 主题（sakura）走内联 background-image。
 * 只移除上一次应用的主题（用 data 属性记录），不每次 remove 全部主题。
 */
function applyBackgroundTexture(codeBlock: HTMLElement, theme: string) {
  const prev = codeBlock.dataset.cbBgTheme
  if (prev && prev !== theme) {
    codeBlock.classList.remove(`${BG_CLASS_PREFIX}${prev}`)
    // 清理 SVG 主题的内联背景
    codeBlock.style.backgroundImage = ""
    codeBlock.style.backgroundSize = ""
    codeBlock.style.backgroundPosition = ""
  }
  if (SVG_BG_THEMES.has(theme)) {
    // SVG 背景主题：复用单例 data URI（全文档只生成一次，浏览器缓存命中）
    codeBlock.style.backgroundImage = `url("${getSakuraUri()}")`
    codeBlock.style.backgroundSize = "cover"
    codeBlock.style.backgroundPosition = "center"
    codeBlock.dataset.cbBgTheme = theme
    return
  }
  const nextClass = `${BG_CLASS_PREFIX}${theme}`
  if (TEXTURE_CLASSES.includes(nextClass)) {
    // 按需注入该主题的纹理 CSS（首次使用才注入 <style>）
    ensureTextureStyle(theme)
    codeBlock.classList.add(nextClass)
    codeBlock.dataset.cbBgTheme = theme
  } else {
    delete codeBlock.dataset.cbBgTheme
  }
}

registerDecor({
  selfSelector: "",
  enhance: ({
    codeBlock,
    settings,
  }) => {
    applyBackgroundTexture(codeBlock, settings.backgroundTheme)
  },
  cleanup: (codeBlock) => {
    applyBackgroundTexture(codeBlock, "")
  },
})

