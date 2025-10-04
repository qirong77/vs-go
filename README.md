# VsGo

<div align="center">

![VsGo Logo](./build/rocket-takeoff@2x.png)

**一个为开发者设计的智能工作空间管理工具**

[![Electron](https://img.shields.io/badge/Electron-38.1.2-blue?logo=electron)](https://electronjs.org/)
[![React](https://img.shields.io/badge/React-19.1.1-blue?logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[English](README_EN.md) | 简体中文

</div>

## 📖 项目简介

VsGo 是一个基于 Electron 构建的桌面应用程序，旨在提升开发者的工作效率。它集成了文件管理、浏览器书签管理、Cookie 管理、笔记功能等多种实用功能，为开发者提供了一个统一的工作空间管理平台。

### ✨ 核心特性

- 🗂️ **智能文件管理** - 快速访问工作区文件，支持 VS Code 集成
- 🌐 **浮动浏览器窗口** - 创建独立的浏览器窗口，支持多任务处理
- 📚 **书签管理** - 导入和管理浏览器书签，支持搜索和分类
- 🍪 **Cookie 管理** - 保存和管理网站 Cookie，方便开发调试
- 📝 **笔记功能** - 内置富文本编辑器，支持网页相关笔记
- ⌨️ **全局快捷键** - 支持快捷键快速呼出主窗口
- 🎯 **智能搜索** - 支持拼音搜索和模糊匹配
- 🔄 **文件访问历史** - 记录文件访问时间，智能排序

## 🎯 主要功能

### 1. 文件管理与快速访问
- 智能扫描桌面和项目目录中的文件和文件夹
- 支持通过 VS Code 或 Finder 打开文件
- 文件访问历史记录，常用文件优先显示
- 支持应用程序快速启动

### 2. 浮动浏览器窗口
- 创建独立的浏览器窗口，不干扰主要工作流程
- 支持网页导航，前进、后退功能
- 自动保存浏览历史和书签
- 始终置顶，方便参考

### 3. 书签管理系统
- 从浏览器导入书签（支持 HTML 格式）
- 智能去重，避免重复添加
- 支持书签搜索和快速访问
- 自动记录网站标题和图标

### 4. Cookie 管理工具
- 保存和管理特定网站的 Cookie
- 支持按 URL 和域名分类存储
- 便于开发调试和测试
- 安全的本地存储

### 5. 笔记功能
- 基于 Slate.js 的富文本编辑器
- 支持网页相关笔记记录
- 自动保存，防止数据丢失
- 支持格式化文本编辑

## 🛠️ 技术栈

### 前端技术
- **Electron** - 跨平台桌面应用框架
- **React** - 用户界面构建
- **TypeScript** - 类型安全的 JavaScript
- **Tailwind CSS** - 现代化 CSS 框架
- **Slate.js** - 富文本编辑器框架

### 构建工具
- **Electron Vite** - 现代化的 Electron 构建工具
- **Electron Builder** - 应用打包和分发
- **ESLint & Prettier** - 代码质量和格式化

### 核心依赖
- **electron-store** - 数据持久化存储
- **electron-updater** - 自动更新功能
- **cheerio** - HTML 解析（书签导入）
- **pinyin** - 中文拼音搜索支持

## 🚀 快速开始

### 环境要求

- Node.js >= 16.0.0
- npm >= 8.0.0 或 yarn >= 1.22.0
- macOS 10.13+ / Windows 10+ / Ubuntu 18.04+

### 安装步骤

1. **克隆项目**
   ```bash
   git clone https://github.com/qirong77/vs-go.git
   cd vs-go
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **开发模式启动**
   ```bash
   npm run dev
   ```

4. **构建应用**
   ```bash
   
   # 构建 macOS 版
   npm run build:mac
   
   # 构建 Windows 版
   npm run build:win
   
   # 构建 Linux 版
   npm run build:linux
   ```

## 📱 使用指南

### 基本操作

1. **启动应用** - 双击应用图标或使用全局快捷键唤起主窗口
2. **搜索文件** - 在搜索框中输入文件名或关键词，支持拼音搜索
3. **打开文件** - 点击文件项或按回车键打开，支持 VS Code 和 Finder 两种方式
4. **创建浮动窗口** - 选择网址后按相应快捷键创建浮动浏览器窗口

### 快捷键

- `Cmd/Ctrl + 空格` - 唤起主窗口
- `回车` - 打开选中的文件/网址
- `上/下箭头` - 切换选中项
- `Cmd/Ctrl + Alt + I` - 打开开发者工具

### 配置文件

应用会自动创建配置目录和默认工作空间：
- **工作空间目录**: `~/Desktop/VsGo-Projects`
- **配置文件**: 自动扫描 `.zshrc` 和 `.zprofile`
- **VS Code 路径**: `/Applications/Visual Studio Code.app`

## 🏗️ 项目结构

```
vs-go/
├── build/                     # 构建资源
│   ├── icon.icns             # macOS 图标
│   ├── icon.ico              # Windows 图标
│   └── entitlements.mac.plist # macOS 权限配置
├── src/
│   ├── common/               # 共享类型和工具
│   │   ├── type.ts          # TypeScript 类型定义
│   │   ├── EVENT.ts         # IPC 事件定义
│   │   └── debounce.ts      # 工具函数
│   ├── main/                # 主进程
│   │   ├── config/          # 配置管理
│   │   ├── electron/        # Electron 相关功能
│   │   │   ├── MainWindow/  # 主窗口管理
│   │   │   ├── FloateWindow/ # 浮动窗口
│   │   │   ├── store.ts     # 数据存储
│   │   │   └── ipcEventHandler.ts # IPC 事件处理
│   │   └── utils/           # 工具函数
│   ├── preload/             # 预加载脚本
│   └── renderer/            # 渲染进程
│       └── src/
│           ├── App.tsx      # 主应用组件
│           ├── hooks/       # React Hooks
│           └── components/  # React 组件
├── electron-builder.yml     # 打包配置
├── electron.vite.config.ts  # Vite 配置
└── package.json            # 项目配置
```

## 🤝 贡献指南

我们欢迎所有形式的贡献！请按照以下步骤参与：

1. **Fork 项目** 到你的 GitHub 账户
2. **创建功能分支** (`git checkout -b feature/AmazingFeature`)
3. **提交更改** (`git commit -m 'Add some AmazingFeature'`)
4. **推送到分支** (`git push origin feature/AmazingFeature`)
5. **创建 Pull Request**

### 开发规范

- 遵循现有的代码风格和格式
- 为新功能添加相应的类型定义
- 确保所有功能都有适当的错误处理
- 提交前运行 `npm run lint` 和 `npm run typecheck`

## 📊 开发状态

项目当前正在积极开发中，主要功能已基本完成：

- ✅ 文件管理和快速访问
- ✅ 浮动浏览器窗口
- ✅ 书签管理系统
- ✅ Cookie 管理工具
- ✅ 笔记功能
- ✅ 智能搜索
- ❌ 其他应用窗口管理（规划中）
- ❌ 屏幕滑动事件（规划中）

## 🐛 问题反馈

如果你遇到任何问题或有功能建议，请：

1. 查看 [Issues](https://github.com/qirong77/vs-go/issues) 是否有类似问题
2. 如果没有，请创建新的 Issue，详细描述问题或建议
3. 提供复现步骤、系统信息等相关信息

## 📄 许可证

本项目采用 MIT license - 查看 [LICENSE](LICENSE) 文件了解详情。

## 👨‍💻 作者

**qirong77** - [GitHub](https://github.com/qirong77)

## 🙏 致谢

感谢以下优秀的开源项目：

- [Electron](https://electronjs.org/) - 跨平台桌面应用框架
- [React](https://reactjs.org/) - 用户界面库
- [Vite](https://vitejs.dev/) - 现代化构建工具
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架
- [Slate.js](https://slatejs.org/) - 富文本编辑器

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给它一个 Star！**

</div>
