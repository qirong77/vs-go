# VsGo

<div align="center">

![VsGo Logo](./build/rocket-takeoff@2x.png)

**面向开发者的桌面工作空间：搜索、浏览、书签、脚本，一站完成**

[![Electron](https://img.shields.io/badge/Electron-40.9.2-blue?logo=electron)](https://electronjs.org/)
[![React](https://img.shields.io/badge/React-19.1.1-blue?logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

## 简介

VsGo 是基于 Electron 的 macOS 桌面工具，把**文件快速启动**、**多标签浏览器**、**书签栏**、**Cookie 管理**、**用户脚本**和**语雀笔记**收进同一套工作流。通过全局快捷键或系统托盘即可唤起，减少在 Finder、浏览器和编辑器之间来回切换。

## 功能概览

| 模块 | 说明 |
| --- | --- |
| 文件搜索 | Spotlight 式搜索，拼音匹配，按访问频率排序 |
| 多标签浏览器 | Chrome 风格标签、地址栏、书签栏 |
| 书签 | 星标收藏、文件夹、拖拽排序，并同步进搜索列表 |
| Cookie | 按站点保存与注入，方便多账号调试 |
| 用户脚本 | Monaco 编辑，页面加载时自动执行 |
| 笔记 | 独立窗口打开语雀文档 |
| 设置 | 默认编辑器（VS Code / Cursor）与脚本管理 |

## 核心功能

### 文件搜索

- **`Alt + Space`**：显示 / 隐藏搜索窗口（置顶，跨桌面可见）
- 扫描目录：`~/Desktop/VsGo-Projects`、`~/Desktop` 下的子项目，以及 `~/.zshrc`、`~/.zprofile`（若存在）
- 支持拼音与模糊匹配；书签 URL 也会出现在结果中
- **Enter** 打开：代码目录走默认编辑器（VS Code 或 Cursor），其余走 Finder
- 访问记录持久化，常用项自动靠前

### 多标签浏览器

- **`Cmd + \``**：显示 / 隐藏浏览器窗口
- 新建、关闭、切换、拖拽排序；标签可拖出为独立窗口
- 地址栏：URL 直达或 Google 搜索；**Shift + Enter** 在新标签打开
- 前进 / 后退 / 刷新；支持全屏
- 新标签默认打开语雀笔记页（可在 `src/shared/type.ts` 修改 `USER_NOTES_YUQUE_URL`）
- 浏览器内 **右键 → 设置** 或地址栏相关入口可打开 `vsgo://settings`

### 书签栏

- 地址栏下方的 Chrome 风格书签栏
- 星标添加 / 编辑当前页；支持文件夹、拖拽排序与右键管理
- 书签会进入主搜索列表；拖到标签栏可在新标签打开

### Cookie 管理

- 页面 **右键 → 查看保存的 Cookie** 打开管理窗口
- 按 URL / 域名保存与复用 Cookie，便于多账号与本地调试

### 用户脚本

- 基于 **Monaco Editor**，JavaScript 语法高亮
- 在 **设置 → 脚本** 中编辑，自动保存到本地
- 浏览器标签页每次加载完成后，在页面上下文中执行脚本（适合注入调试、简单自动化）

### 笔记

- **系统托盘 → 笔记**，或页面 **右键 → 查看笔记**
- 在独立窗口中打开语雀文档（默认链接见 `USER_NOTES_YUQUE_URL`）

### 设置

- **系统托盘 → 设置**，或浏览器内 `vsgo://settings`
- **App 设置**：默认编辑器（VS Code / Cursor）
- **脚本**：用户脚本编辑（与浏览器注入联动）

### macOS 工作区应用（可选）

启动时会检查并尝试拉起预设的辅助应用（如 MonitorControl、Maccy 等），逻辑见 `src/setupWorkSpaceApp.ts`。不需要可自行从 `src/app.ts` 中移除对应 `import`。

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Alt + Space` | 文件搜索窗口 显示 / 隐藏 |
| `` Cmd + ` `` | 多标签浏览器 显示 / 隐藏 |

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 桌面壳 | Electron 40 |
| UI | React 19、Ant Design 6、Tailwind CSS 3 |
| 语言 | TypeScript 5.9 |
| 编辑器 | Monaco Editor |
| 构建 | electron-vite 4、electron-builder 25 |
| 存储 | electron-store |
| 搜索 | pinyin |

## 快速开始

### 环境要求

- **Node.js >= 22**、npm >= 10
- 主要开发与测试环境：**macOS**（部分能力如 `open -a`、工作区应用检测依赖 macOS）

### 安装与运行

```bash
git clone https://github.com/qirong77/vs-go.git
cd vs-go
npm install
npm run dev
```

### 常用命令

```bash
npm run dev          # 开发模式
npm run build        # 类型检查 + 构建
npm run typecheck    # 仅类型检查
npm run lint         # ESLint
npm run build:mac    # 打包 macOS
npm run build:win    # 打包 Windows
npm run build:linux  # 打包 Linux
```

## 配置说明

工作空间与编辑器路径在 `src/config/index.ts` 中维护：

| 配置项 | 默认值 |
| --- | --- |
| `workSpaceDirectories` | `~/Desktop/VsGo-Projects`、`~/Desktop` |
| `shellConfigFiles` | 存在的 `~/.zshrc`、`~/.zprofile` |
| `codeAppPath` | `/Applications/Visual Studio Code.app` |
| `cursorAppPath` | `/Applications/Cursor.app` |

笔记与浏览器新标签首页 URL 在 `src/shared/type.ts` 的 `USER_NOTES_YUQUE_URL`。

## 项目结构

```
vs-go/
├── src/
│   ├── shared/                 # 跨进程类型与工具
│   ├── config/                 # 工作空间、编辑器路径
│   ├── platform/
│   │   ├── electron/           # 窗口、IPC、快捷键、右键菜单
│   │   ├── preload/            # 预加载脚本
│   │   ├── renderer/           # 渲染入口、路由、静态资源
│   │   └── store/              # electron-store schema
│   ├── windows/
│   │   ├── main-window/        # 文件搜索窗口
│   │   ├── browser/            # 多标签浏览器、书签栏、浮层 UI
│   │   ├── cookie-manager/     # Cookie 管理
│   │   ├── script-editor/      # 脚本编辑（Monaco）
│   │   ├── app-setting/        # App 设置组件与 IPC
│   │   ├── settings/           # 统一设置窗口（App + 脚本）
│   │   └── user-notes/         # 语雀笔记窗口（主进程 loadURL）
│   ├── utils/                  # 打开编辑器等
│   ├── tray/                   # 系统托盘
│   ├── setupWorkSpaceApp.ts    # macOS 辅助应用自检（可选）
│   ├── app.ts                  # 应用引导
│   └── main/                   # Electron 主进程入口
├── build/                      # 图标等资源
├── electron.vite.config.ts
└── package.json
```

## 贡献

1. Fork 本仓库
2. 创建分支：`git checkout -b feature/your-feature`
3. 提交前执行：`npm run lint && npm run typecheck`
4. 发起 Pull Request

## 问题反馈

[GitHub Issues](https://github.com/qirong77/vs-go/issues)

## 许可证

[MIT](LICENSE)

## 作者

**qirong77** — [GitHub](https://github.com/qirong77)
