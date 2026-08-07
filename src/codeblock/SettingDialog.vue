<template>
  <div class="cb-setting">
    <div class="cb-setting__item fn__flex">
      <span class="cb-setting__label">启用代码块美化</span>
      <label class="fn__flex">
        <input
          v-model="form.enabled"
          type="checkbox"
          class="b3-switch fn__flex-center"
        >
      </label>
    </div>

    <template v-if="form.enabled">
      <div class="fn__hr"></div>

      <!-- ===== 外观 ===== -->
      <div class="cb-setting__title">
        外观
      </div>
      <div class="cb-setting__item fn__flex">
        <span class="cb-setting__label">圆角</span>
        <input
          v-model.number="form.borderRadius"
          type="range"
          min="0"
          max="24"
          step="1"
          class="b3-slider fn__flex-center cb-setting__slider"
        >
        <span class="cb-setting__value">{{ form.borderRadius }}px</span>
      </div>
      <div class="cb-setting__item fn__flex">
        <span class="cb-setting__label">边框宽度</span>
        <input
          v-model.number="form.borderWidth"
          type="range"
          min="0"
          max="4"
          step="1"
          class="b3-slider fn__flex-center cb-setting__slider"
        >
        <span class="cb-setting__value">{{ form.borderWidth }}px</span>
      </div>
      <div class="cb-setting__item fn__flex">
        <span class="cb-setting__label">边框颜色</span>
        <input
          type="color"
          class="cb-setting__color fn__flex-center"
          :value="form.borderColor || DEFAULT_COLOR"
          @input="form.borderColor = ($event.target as HTMLInputElement).value"
        >
        <button
          class="b3-button b3-button--outline fn__flex-center cb-setting__reset-btn"
          @click="form.borderColor = ''"
        >
          默认
        </button>
      </div>
      <div class="cb-setting__item fn__flex">
        <span class="cb-setting__label">边框样式</span>
        <select
          v-model="form.borderStyle"
          class="b3-select fn__flex-center cb-setting__select"
        >
          <option value="solid">
            实线
          </option>
          <option value="pixel">
            像素游戏
          </option>
          <option value="dashed">
            虚线
          </option>
          <option value="handdrawn">
            手绘感
          </option>
        </select>
      </div>
      <div class="cb-setting__item fn__flex">
        <span class="cb-setting__label">阴影大小</span>
        <input
          v-model.number="form.shadowSize"
          type="range"
          min="-20"
          max="24"
          step="1"
          class="b3-slider fn__flex-center cb-setting__slider"
        >
        <span class="cb-setting__value">{{ form.shadowSize }}px</span>
      </div>
      <div class="cb-setting__hint cb-setting__url-hint">
        {{ form.shadowSize > 0 ? "正数：下投影（上凸感）" : form.shadowSize < 0 ? "负数：内嵌（下凹感）" : "0：无阴影" }}
      </div>
      <div class="cb-setting__item fn__flex">
        <span class="cb-setting__label">代码统计角标</span>
        <label class="fn__flex">
          <input
            v-model="form.codeStats"
            type="checkbox"
            class="b3-switch fn__flex-center"
          >
        </label>
        <span class="cb-setting__hint">底部显示行数/字符数</span>
      </div>

      <div class="fn__hr"></div>

      <!-- ===== 背景 ===== -->
      <div class="cb-setting__title">
        背景
      </div>
      <div class="cb-setting__item fn__flex">
        <span class="cb-setting__label">背景颜色</span>
        <input
          type="color"
          class="cb-setting__color fn__flex-center"
          :value="form.backgroundColor || DEFAULT_COLOR"
          @input="form.backgroundColor = ($event.target as HTMLInputElement).value"
        >
        <button
          class="b3-button b3-button--outline fn__flex-center cb-setting__reset-btn"
          @click="form.backgroundColor = ''"
        >
          默认
        </button>
        <span class="cb-setting__hint">留空则跟随思源主题</span>
      </div>
      <div class="cb-setting__item fn__flex cb-setting__url-row">
        <span class="cb-setting__label">背景图片</span>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="b3-text-field fn__flex-center cb-setting__url"
          @change="onImageSelected"
        >
        <button
          class="b3-button b3-button--outline fn__flex-center cb-setting__reset-btn"
          @click="clearImage"
        >
          清除
        </button>
        <button
          type="button"
          class="b3-button b3-button--outline fn__flex-center cb-bg-select__toggle"
          @click="showBgList = !showBgList"
        >
          已上传图片（{{ bgImages.length }}）▾
        </button>
      </div>
      <div
        v-if="showBgList"
        class="cb-bg-select"
      >
        <div class="cb-bg-select__list">
          <div
            v-if="!bgImages.length"
            class="cb-bg-select__empty"
          >
            暂无已上传图片，请先上传
          </div>
          <div
            v-for="img in bgImages"
            :key="img.name"
            class="cb-bg-select__item"
            :class="{ 'cb-bg-select__item--active': form.backgroundImage === img.path }"
          >
            <img
              v-if="img.previewUrl"
              :src="img.previewUrl"
              alt=""
              class="cb-bg-select__thumb"
            >
            <span
              class="cb-bg-select__name"
              :title="img.name"
            >
              {{ img.name }}
            </span>
            <button
              class="b3-button b3-button--outline fn__flex-center cb-setting__reset-btn"
              @click="form.backgroundImage = img.path"
            >
              使用
            </button>
            <button
              class="b3-button b3-button--outline fn__flex-center cb-setting__reset-btn cb-bg-select__del"
              @click="removeImage(img.name)"
            >
              删除
            </button>
          </div>
        </div>
      </div>
      <div class="cb-setting__item fn__flex">
        <span class="cb-setting__label">虚化强度</span>
        <input
          v-model.number="form.backgroundBlur"
          type="range"
          min="0"
          max="40"
          step="1"
          class="b3-slider fn__flex-center cb-setting__slider"
        >
        <span class="cb-setting__value">{{ form.backgroundBlur }}px</span>
      </div>
      <div class="cb-setting__item fn__flex">
        <span class="cb-setting__label">遮罩不透明度</span>
        <input
          v-model.number="form.backgroundMaskOpacity"
          type="range"
          min="0"
          max="100"
          step="1"
          class="b3-slider fn__flex-center cb-setting__slider"
        >
        <span class="cb-setting__value">{{ form.backgroundMaskOpacity }}%</span>
      </div>
      <div class="cb-setting__item fn__flex">
        <span class="cb-setting__label">背景主题</span>
        <select
          v-model="form.backgroundTheme"
          class="b3-select fn__flex-center cb-setting__select"
        >
          <option value="">
            无
          </option>
          <option value="grid">
            网格纸
          </option>
          <option value="dots">
            点阵
          </option>
          <option value="ruled">
            横线本
          </option>
          <option value="columns">
            竖线本
          </option>
          <option value="cross">
            交叉网格
          </option>
          <option value="dotgrid">
            虚线网格
          </option>
          <option value="stripes">
            斜纹
          </option>
          <option value="notebook">
            笔记本页
          </option>
          <option value="carbon">
            碳纤维
          </option>
          <option value="graph">
            小方格纸
          </option>
        </select>
        <span class="cb-setting__hint">低透明度装饰，不影响代码阅读</span>
      </div>

      <div class="fn__hr"></div>

      <!-- ===== 代码 ===== -->
      <div class="cb-setting__title">
        代码
      </div>
      <div class="cb-setting__item fn__flex">
        <span class="cb-setting__label">显示代码行号</span>
        <label class="fn__flex">
          <input
            v-model="form.showLineNumber"
            type="checkbox"
            class="b3-switch fn__flex-center"
          >
        </label>
        <span class="cb-setting__hint">控制思源原生行号显示，保存后生效</span>
      </div>
      <div class="cb-setting__item fn__flex">
        <span class="cb-setting__label">代码字体</span>
        <select
          v-model="form.codeFontFamily"
          class="b3-select fn__flex-center cb-setting__select"
        >
          <option value="">
            跟随主题
          </option>
          <option value="Consolas">
            Consolas
          </option>
          <option value="'Cascadia Code'">
            Cascadia Code
          </option>
          <option value="'JetBrains Mono'">
            JetBrains Mono
          </option>
          <option value="'Fira Code'">
            Fira Code
          </option>
          <option value="'Source Code Pro'">
            Source Code Pro
          </option>
          <option value="'Courier New'">
            Courier New
          </option>
          <option value="Menlo">
            Menlo
          </option>
          <option value="Monaco">
            Monaco
          </option>
          <option value="'IBM Plex Mono'">
            IBM Plex Mono
          </option>
          <option value="'Sarasa Mono SC'">
            Sarasa Mono SC（更纱黑体）
          </option>
          <option value="'Noto Sans Mono'">
            Noto Sans Mono
          </option>
        </select>
        <span class="cb-setting__hint">留空跟随主题</span>
      </div>
      <div class="cb-setting__item fn__flex">
        <span class="cb-setting__label">当前行高亮</span>
        <label class="fn__flex">
          <input
            v-model="form.currentLineHighlight"
            type="checkbox"
            class="b3-switch fn__flex-center"
          >
        </label>
        <span class="cb-setting__hint">跟随输入光标</span>
      </div>
      <div
        v-if="form.currentLineHighlight"
        class="cb-setting__item fn__flex"
      >
        <span class="cb-setting__label">高亮颜色</span>
        <input
          v-model="form.currentLineColor"
          type="color"
          class="b3-color-picker fn__flex-center cb-setting__color"
        >
        <button
          class="b3-button b3-button--outline fn__flex-center cb-setting__reset-btn"
          @click="form.currentLineColor = ''"
        >
          清除
        </button>
        <span class="cb-setting__hint">留空使用主题默认</span>
      </div>
      <div class="cb-setting__item fn__flex">
        <span class="cb-setting__label">语法高亮主题</span>
        <select
          v-model="form.highlightTheme"
          class="b3-select fn__flex-center cb-setting__select"
        >
          <option value="">
            跟随思源设置
          </option>
          <option
            v-for="t in HIGHLIGHT_THEMES"
            :key="t"
            :value="t"
          >
            {{ t }}
          </option>
        </select>
        <span class="cb-setting__hint">覆盖思源代码块高亮配色</span>
      </div>

      <div class="fn__hr"></div>

      <!-- ===== 长代码折叠 ===== -->
      <div class="cb-setting__title">
        长代码折叠
      </div>
      <div class="cb-setting__item fn__flex">
        <span class="cb-setting__label">启用</span>
        <label class="fn__flex">
          <input
            v-model="form.longCodeFold"
            type="checkbox"
            class="b3-switch fn__flex-center"
          >
        </label>
        <span class="cb-setting__hint">超过固定行数的代码块顶部显示「只显示固定行」按钮</span>
      </div>
      <div
        v-if="form.longCodeFold"
        class="cb-setting__item fn__flex"
      >
        <span class="cb-setting__label">固定行数</span>
        <input
          v-model.number="form.longCodeThreshold"
          type="range"
          min="5"
          max="100"
          step="1"
          class="b3-slider fn__flex-center cb-setting__slider"
        >
        <span class="cb-setting__value">{{ form.longCodeThreshold }} 行</span>
      </div>

      <div class="fn__hr"></div>

      <!-- ===== 主题风格 ===== -->
      <div class="cb-setting__title">
        主题风格
      </div>
      <div class="cb-setting__item fn__flex">
        <span class="cb-setting__label">启用</span>
        <label class="fn__flex">
          <input
            v-model="form.themeStyleEnabled"
            type="checkbox"
            class="b3-switch fn__flex-center"
          >
        </label>
        <span class="cb-setting__hint">在代码块顶部栏添加主题装饰</span>
      </div>
      <div
        v-if="form.themeStyleEnabled"
        class="cb-setting__item fn__flex"
      >
        <span class="cb-setting__label">风格</span>
        <select
          v-model="form.themeStyle"
          class="b3-select fn__flex-center cb-setting__select"
        >
          <option value="mac">
            Mac 风格（红黄绿圆点）
          </option>
          <option value="windows">
            Windows 风格（窗口控制按钮）
          </option>
          <option value="ubuntu">
            Ubuntu 风格（橙黄绿圆点）
          </option>
          <option value="chrome">
            Chrome 标签风格
          </option>
          <option value="terminal">
            终端提示符
          </option>
          <option value="codesym">
            代码符号
          </option>
        </select>
      </div>
    </template>

    <div class="cb-setting__actions fn__flex">
      <button
        class="b3-button b3-button--outline fn__flex-center cb-setting__reset"
        @click="resetDefaults"
      >
        {{ i18n.resetDefaults }}
      </button>
      <button
        class="b3-button b3-button--outline fn__flex-center"
        @click="cancel"
      >
        {{ i18n.cancel }}
      </button>
      <button
        class="b3-button b3-button--text fn__flex-center"
        @click="save"
      >
        {{ i18n.save }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Dialog } from "siyuan"
import type { UploadedImage } from "./background"
import type { CodeBlockSettings } from "./settings"
import {
  onMounted,
  reactive,
  ref,
} from "vue"
import {
  deleteBackgroundImage,
  fetchFileBlob,
  listBackgroundImages,
  uploadBackgroundImage,
} from "./background"
import { HIGHLIGHT_THEMES } from "./highlight-theme"
import {
  DEFAULT_SETTINGS,
} from "./settings"

interface I18nText {
  cancel: string
  save: string
  resetDefaults: string
}

const props = defineProps<{
  settings: CodeBlockSettings
  i18n?: Partial<I18nText>
  dialog?: Dialog
  onSave?: (settings: CodeBlockSettings) => void
}>()

const i18n: I18nText = {
  cancel: props.i18n?.cancel ?? "取消",
  save: props.i18n?.save ?? "保存",
  resetDefaults: props.i18n?.resetDefaults ?? "恢复默认设置",
}

const form = reactive<CodeBlockSettings>({ ...props.settings })

/** 颜色选择器占位色（当前未自定义时显示） */
const DEFAULT_COLOR = "#808080"

/** 背景图片文件选择框 */
const fileInput = ref<HTMLInputElement | null>(null)

/** 已上传背景图片列表（含 objectURL 预览） */
interface BgItem extends UploadedImage {
  previewUrl: string
}

const bgImages = ref<BgItem[]>([])

/** 下拉列表展开状态 */
const showBgList = ref(false)

/** 加载已上传图片列表，并为每张图异步生成预览 objectURL */
const refreshImages = async () => {
  bgImages.value.forEach((img) => {
    if (img.previewUrl) {
      URL.revokeObjectURL(img.previewUrl)
    }
  })
  const items = await listBackgroundImages()
  const withPreview = await Promise.all(items.map(async (img): Promise<BgItem> => {
    try {
      const blob = await fetchFileBlob(img.path)
      return {
        ...img,
        previewUrl: URL.createObjectURL(blob),
      }
    } catch {
      return {
        ...img,
        previewUrl: "",
      }
    }
  }))
  bgImages.value = withPreview
}

onMounted(() => {
  refreshImages()
})

/** 本地图片上传：上传到插件存储目录，选中使用并刷新列表 */
const onImageSelected = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) {
    return
  }
  try {
    const uploaded = await uploadBackgroundImage(file)
    form.backgroundImage = uploaded.path
    showBgList.value = true
    await refreshImages()
  } catch (err) {
    console.warn("upload background image failed", err)
  }
}

/** 删除已上传的图片（同时删除存储目录中的文件） */
const removeImage = async (name: string) => {
  const target = bgImages.value.find((img) => img.name === name)
  if (!target) {
    return
  }
  try {
    await deleteBackgroundImage(name)
    if (form.backgroundImage === target.path) {
      form.backgroundImage = ""
    }
    await refreshImages()
  } catch (err) {
    console.warn("delete background image failed", err)
  }
}

const clearImage = () => {
  form.backgroundImage = ""
  if (fileInput.value) {
    fileInput.value.value = ""
  }
}

const resetDefaults = () => {
  Object.assign(form, DEFAULT_SETTINGS)
}

const cancel = () => {
  props.dialog?.destroy()
}

const save = () => {
  props.onSave?.({ ...form })
  props.dialog?.destroy()
}
</script>

<style scoped>
.cb-setting {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 16px 12px;
}

.cb-setting__title {
  font-size: 13px;
  font-weight: 600;
  opacity: 0.6;
  padding: 4px 0;
}

.cb-setting__item {
  align-items: center;
  gap: 12px;
  min-height: 32px;
}

.cb-setting__label {
  flex: 1;
  font-size: 14px;
  max-width: 160px;
}

.cb-setting__hint {
  flex: 1;
  font-size: 12px;
  opacity: 0.6;
}

.cb-setting__slider {
  width: 180px;
}

.cb-setting__value {
  width: 56px;
  font-size: 12px;
  opacity: 0.7;
}

.cb-setting__color {
  width: 40px;
  height: 26px;
  padding: 2px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

.cb-setting__select {
  width: 200px;
}

.cb-setting__reset-btn {
  padding: 2px 10px;
  font-size: 12px;
}

.cb-setting__actions {
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--b3-border-color);
  position: sticky;
  bottom: 0;
  background-color: var(--b3-theme-background);
  z-index: 1;
}

.cb-setting__actions .cb-setting__reset {
  margin-right: auto;
}

.cb-setting__url {
  flex: 1;
  min-width: 0;
}

.cb-setting__url-row {
  gap: 8px;
}

/* 已上传背景图片下拉列表 */
.cb-bg-select__toggle {
  flex-shrink: 0;
}

.cb-bg-select__list {
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background-color: var(--b3-theme-background);
  padding: 4px;
}

.cb-bg-select__empty {
  padding: 8px;
  font-size: 12px;
  opacity: 0.6;
  text-align: center;
}

.cb-bg-select__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  border-radius: 4px;

  &:hover {
    background-color: var(--b3-theme-background-light);
  }
}

.cb-bg-select__item--active {
  outline: 1px solid var(--b3-theme-primary);
}

.cb-bg-select__thumb {
  width: 36px;
  height: 36px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
}

.cb-bg-select__name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cb-bg-select__del {
  color: var(--b3-theme-error, #d23f31);
}
</style>
