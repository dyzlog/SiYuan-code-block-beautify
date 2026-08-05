/**
 * 背景图片管理：上传/读取/删除思源内核存储中的图片。
 * 存储路径：data/storage/petal/code-block-beautify/（随工作空间持久保存）。
 * 注意：思源文件 API 为 POST-only，getFile 需以 XHR 取 blob 后转 objectURL。
 */
import { fetchSyncPost } from "siyuan"
import {
  registerDecor,
} from "./registry"

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

/** CSS 纹理主题 class 列表（纯 CSS 纹理） */
export const TEXTURE_CLASSES = ["grid", "dots", "matrix", "blueprint", "diagonal", "ripples", "checkerboard", "carbon", "aurora", "honeycomb", "barcode"].map((t) => `cb-bg-${t}`)

/** 应用 CSS 背景纹理主题（通过 class 控制） */
export function applyBackgroundTexture(codeBlock: HTMLElement, theme: string) {
  codeBlock.classList.remove(...TEXTURE_CLASSES)
  if (TEXTURE_CLASSES.includes(`cb-bg-${theme}`)) {
    codeBlock.classList.add(`cb-bg-${theme}`)
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

