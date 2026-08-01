# 代码块美化 - 思源插件

基于 [plugin-sample-vite-vue](https://github.com/Wetoria/plugin-sample-vite-vue) 脚手架开发的思源笔记插件，用于美化代码块。

## 功能

- **视觉美化**：圆角、阴影、边框（全部跟随思源主题变量，适配深浅色）
- **行号**：代码块左侧显示行号，随滚动同步，编辑时自动更新
- **代码内折叠**：行号左侧显示折叠按钮（▾），可折叠 for 循环、if、函数、对象等代码块结构（类似 IDE）；点击代码区域进入编辑时自动展开
- **语言标签**：可选常显语言徽章（默认关闭，避免遮挡代码；需要时在设置中开启）
- **设置面板**：思源插件设置中可开关以上所有功能、调整圆角

> 复制代码使用思源自带按钮，本插件不重复添加。

## 开发

```bash
npm install --legacy-peer-deps
# 复制 .env.example 为 .env，设置 VITE_SIYUAN_WORKSPACE_PATH 指向思源工作空间
npm run dev        # watch 构建，直接输出到思源插件目录
npm run build      # 构建 dist/ 并打包 package.zip
```

> 注：依赖中的 `vite-plugin-static-copy` 声明支持的 vite 版本较旧（peer 依赖冲突），npm 安装需加 `--legacy-peer-deps`。

## 发布

推送 `v*` tag 即可触发 GitHub Action 自动打包发布，或手动上传 `package.zip` 到 Release。
