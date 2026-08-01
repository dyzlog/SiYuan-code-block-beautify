import type { CodeBlockSettings } from "@/codeblock/settings"
import {
  Dialog,
  getFrontend,
  Plugin,
  showMessage,
} from "siyuan"
import { createApp } from "vue"
import PluginInfoString from "@/../plugin.json"
import { applyBackgroundImage } from "@/codeblock/background"
import {
  destroyCodeBlockEnhancer,
  initCodeBlockEnhancer,
  updateSettings,
} from "@/codeblock/enhancer"
import {
  applyHighlightTheme,
  clearHighlightTheme,
} from "@/codeblock/highlight-theme"
import {
  applyThemeStyleClass,
  clearThemeStyleClass,
} from "@/codeblock/longcode"
import SettingDialog from "@/codeblock/SettingDialog.vue"
import {
  applySettingsVars,

  DEFAULT_SETTINGS,
  mergeSettings,
  STORAGE_NAME,
} from "@/codeblock/settings"
import "@/index.scss"

let PluginInfo = {
  version: '',
}
try {
  PluginInfo = PluginInfoString
} catch (err) {
  console.log('Plugin info parse error: ', err)
}
const {
  version,
} = PluginInfo

export default class CodeBlockBeautify extends Plugin {
  /** 是否运行在移动端（用于设置面板宽度） */
  public isMobile: boolean
  public readonly version = version

  private settings: CodeBlockSettings = { ...DEFAULT_SETTINGS }
  private settingDialog: Dialog | null = null
  private settingApp: ReturnType<typeof createApp> | null = null

  /** 一次性应用全部全局设置（样式变量 / 高亮主题 / 背景图 / 主题风格） */
  private applyAllSettings(s: CodeBlockSettings) {
    applySettingsVars(s)
    applyHighlightTheme(s.highlightTheme)
    applyBackgroundImage(s.backgroundImage)
    applyThemeStyleClass(s.themeStyleEnabled ? s.themeStyle : "")
  }

  async onload() {
    const frontEnd = getFrontend()
    this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile"

    console.log('Code Block Beautify plugin loaded, the plugin is ', this)

    // 先用默认设置启动，加载已保存设置后再更新
    this.applyAllSettings(this.settings)
    initCodeBlockEnhancer(this, this.settings)
  }

  onLayoutReady() {
    this.loadData(STORAGE_NAME)
      .then((data) => {
        if (data) {
          this.settings = mergeSettings(data)
          this.applyAllSettings(this.settings)
          updateSettings(this.settings)
        }
      })
      .catch((e) => {
        console.warn('load settings failed, use defaults', e)
      })
  }

  onunload() {
    if (this.settingDialog) {
      this.settingDialog.destroy()
      this.settingDialog = null
    }
    destroyCodeBlockEnhancer()
    clearHighlightTheme()
    applyBackgroundImage("")
    clearThemeStyleClass()
  }

  openSetting() {
    if (this.settingDialog) {
      this.settingDialog.destroy()
    }
    const dialog = new Dialog({
      title: this.i18n.settingTitle || '代码块美化设置',
      content: '<div id="cb-setting-root" class="cb-setting-root"></div>',
      width: this.isMobile ? '92vw' : '560px',
      height: this.isMobile ? '80vh' : '70vh',
      destroyCallback: () => {
        if (this.settingApp) {
          this.settingApp.unmount()
          this.settingApp = null
        }
        this.settingDialog = null
      },
    })
    this.settingDialog = dialog
    const root = dialog.element.querySelector('#cb-setting-root')
    if (root) {
      this.settingApp = createApp(SettingDialog, {
        settings: this.settings,
        i18n: this.i18n,
        dialog,
        onSave: (next: CodeBlockSettings) => {
          this.settings = next
          this.applyAllSettings(next)
          updateSettings(next)
          this.saveData(STORAGE_NAME, next)
            .catch((e) => console.warn('save settings failed', e))
          showMessage(this.i18n.saved || '设置已保存', 3000, 'info')
        },
      })
      this.settingApp.mount(root)
    }
  }
}
