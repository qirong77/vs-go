# VsGo

<div align="center">

![VsGo Logo](./build/rocket-takeoff@2x.png)

**一个为开发者设计的智能工作空间管理工具**

[![Electron](https://img.shields.io/badge/Electron-40.9.2-blue?logo=electron)](https://electronjs.org/)
[![React](https://img.shields.io/badge/React-19.1.1-blue?logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[English](README_EN.md) | 简体中文

</div>

## 项目简介

VsGo 是一个基于 Electron 的桌面应用，将文件搜索、多标签浏览器、书签管理、Cookie 管理、代码脚本和笔记整合为一个统一的工作空间，通过全局快捷键随时唤起。

## 核心功能

### 文件搜索与快速启动

- `Alt + Space` 唤起类 Spotlight 的搜索窗口，输入关键字实时过滤
- 自动扫描 `~/Desktop/VsGo-Projects` 和 `~/Desktop` 下的文件/文件夹，以及 shell 配置文件（`.zshrc`、`.zprofile`）
- 支持拼音搜索和模糊匹配
- 按访问时间排序，常用文件自动靠前
- 可一键通过 VS Code、Cursor 或 Finder 打开项目，应用列表展示图标
- 窗口置顶、跨所有桌面可见，随时呼出随时隐藏

### 多标签浏览器（Chrome 风格）

- `Cmd + `` 切换唤起多标签浏览器窗口
- 完整的多标签管理：新建、关闭、切换、拖拽排序、拖拽标签脱离为独立窗口
- 地址栏支持 URL 导航和 Google 搜索，`Shift + Enter` 在新标签打开
- 前进、后退、刷新按钮，全屏模式
- 所有窗口关闭后记忆状态，重新打开恢复标签

### 书签管理

- Chrome 风格书签栏，显示在地址栏下方
- 点击星标按钮添加/编辑当前页面书签
- 支持文件夹层级分类，拖拽重排
- 右键菜单：重命名、移动到其他文件夹、新建子文件夹、删除
- 书签项也会出现在主搜索窗口中，输入关键词即可找到并打开
- 拖动书签到标签栏释放可在新标签打开

### Cookie 管理器

- 右键菜单中打开 Cookie 管理窗口
- 保存当前页面的 Cookie（按 URL / 域名分类存储）
- 一键将已保存的 Cookie 应用到当前页面
- 便于多账号切换、开发调试

### 脚本编辑器

- 内置 Monaco Editor（VS Code 同款内核），支持 JavaScript 语法高亮
- 编写自定义脚本，编辑后半秒自动保存到本地
- 浮动浏览器窗口每次加载页面时会在该页面上下文中自动执行脚本
- 适合注入调试代码、自动化操作等场景

### 应用设置

- 设置窗口左右分栏布局（App 设置 / 脚本编辑器）
- 选择默认编辑器：VS Code 或 Cursor

## 技术栈

- **Electron 40** - 跨平台桌面应用框架
- **React 19** - UI 框架
- **TypeScript 5.9** - 类型安全
- **Ant Design 6** - 组件库
- **Monaco Editor** - 代码编辑器
- **Tailwind CSS 3** - CSS 工具类
- **electron-vite 4** - 构建工具
- **electron-builder 25** - 应用打包
- **electron-store** - 数据持久化
- **pinyin** - 拼音搜索

## 快速开始

### 环境要求

- Node.js >= 22
- npm >= 10
- macOS 10.13+ / Windows 10+ / Ubuntu 18.04+

### 安装

```bash
git clone https://github.com/qirong77/vs-go.git
cd vs-go
npm install
```

### 开发

```bash
npm run dev
```

### 构建

```bash
npm run build:mac    # macOS
npm run build:win    # Windows
npm run build:linux  # Linux
```

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Alt + Space` | 唤起 / 隐藏文件搜索窗口 |
| `` Cmd + ` `` | 切换多标签浏览器窗口 |

## 工作空间

- 工作空间目录：`~/Desktop/VsGo-Projects`
- Shell 配置文件自动扫描：`.zshrc`、`.zprofile`

## 项目结构

```
vs-go/
├── src/
│   ├── shared/                    # 跨进程共享类型、工具函数
│   ├── config/                    # 配置管理
│   ├── platform/
│   │   ├── electron/              # Electron 基础设施（窗口管理、IPC、快捷键、右键菜单）
│   │   ├── preload/               # 预加载脚本
│   │   ├── renderer/              # 渲染进程入口、路由、静态资源
│   │   └── store/                 # 数据持久化
│   ├── windows/
│   │   ├── main-window/           # 主搜索窗口
│   │   ├── browser/               # 多标签浏览器 + Chrome 书签栏
│   │   ├── cookie-manager/        # Cookie 管理器
│   │   ├── script-editor/         # 脚本编辑器（Monaco）
│   │   ├── settings/              # 设置页面（侧边栏导航：App 设置 + 脚本）
│   │   ├── app-setting/           # 应用设置
│   │   └── user-notes/            # 笔记窗口
│   ├── utils/                     # 工具函数（打开编辑器、路径等）
│   ├── tray/                      # 系统托盘
│   ├── app.ts                     # 应用入口
│   └── main/                      # 主进程入口
├── build/                         # 构建资源（图标、权限配置）
├── electron-builder.yml
├── electron.vite.config.ts
└── package.json
```

## 贡献

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 创建 Pull Request

提交前请运行 `npm run lint && npm run typecheck`。

## 问题反馈

[GitHub Issues](https://github.com/qirong77/vs-go/issues)

## 许可证

MIT - 详见 [LICENSE](LICENSE)

## 作者

**qirong77** - [GitHub](https://github.com/qirong77)

---

<div align="center">

**如果这个项目对你有帮助，请给它一个 Star！**

</div>
