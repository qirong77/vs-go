# AGENT.md

本文件为在此仓库工作的 AI 编程代理提供上下文。修改代码前请先阅读本文件与 `README.md`。

## 项目概览

VsGo 是基于 **Electron** 的 macOS 桌面工具，面向开发者提供：文件快速启动、多标签浏览器、书签栏、Cookie 管理、用户脚本与语雀笔记，统一在一个工作流中，通过全局快捷键或系统托盘唤起。

## 技术栈

- **桌面壳**：Electron 40
- **UI**：React 19 + Ant Design 6 + Tailwind CSS 3
- **语言**：TypeScript 5.9（strict）
- **编辑器组件**：Monaco Editor
- **构建**：electron-vite 4 + electron-builder 25
- **持久化**：electron-store
- **搜索**：pinyin（拼音/模糊匹配）

## 环境要求

- Node.js **>= 22**、npm >= 10
- 主要开发与测试环境为 **macOS**：`open -a`、辅助应用检测、托盘图标等依赖 macOS 能力，跨平台改动需谨慎。
- 引擎要求见 `package.json` 的 `engines` 字段。

## 常用命令

```bash
npm run dev          # 开发模式（electron-vite dev）
npm run build        # typecheck + electron-vite build
npm run typecheck    # 仅类型检查（node + web 两个工程）
npm run lint         # ESLint（带 --fix）
npm run test:remote-browser  # 远程浏览器核心测试（node --test）
npm run build:mac    # 打包 macOS
npm run build:win    # 打包 Windows
npm run build:linux  # 打包 Linux
npm run format       # Prettier 格式化
```

提交代码前建议执行 `npm run lint && npm run typecheck`。

## 目录结构

```
vs-go/
├── src/
│   ├── app.ts                    # 应用引导（工作站检查等）
│   ├── main/                     # Electron 主进程入口
│   ├── platform/
│   │   ├── electron/             # 窗口、IPC、快捷键、右键菜单、createWindow、managedSubWindow
│   │   ├── preload/              # 预加载脚本（index.tsx 为入口）
│   │   ├── renderer/             # 渲染入口、路由、静态资源（root 为 src/platform/renderer）
│   │   └── log/                  # 主进程日志（buffer/logger/ipc/events）
│   ├── windows/                  # 各窗口模块：main-window、browser、cookie-manager、script-editor、
│   │   ├── main-window/          #   文件搜索窗口
│   │   ├── browser/              #   多标签浏览器、书签栏、浮层、远程浏览器核心
│   │   │   └── electron/         #   TabbedBrowser 相关主进程逻辑
│   │   ├── cookie-manager/       #   Cookie 管理
│   │   ├── script-editor/        #   Monaco 脚本编辑
│   │   ├── app-setting/          #   App 设置组件与 IPC
│   │   ├── settings/             #   统一设置窗口
│   │   ├── user-notes/           #   语雀笔记窗口
│   │   ├── terminal/             #   终端
│   │   └── log-viewer/           #   日志查看
│   ├── config/                   # 工作空间、编辑器路径
│   ├── shared/                   # 跨进程类型与工具（type.ts、utils.ts 等）
│   ├── utils/                    # 打开编辑器、获取子目录等
│   ├── tray/                     # 系统托盘
│   ├── setupWorkSpaceApp.ts      # macOS 辅助应用自检（可选）
│   └── test/                     # 测试（remote-browser-core.test.ts）
├── build/                        # 图标等资源（含 tray 图标 rocket-takeoff@2x.png）
├── electron.vite.config.ts
└── package.json
```

## 路径别名

定义于 `electron.vite.config.ts`，主/预加载/渲染进程共用：

- `@shared` → `src/shared`
- `@platform` → `src/platform`
- `@windows` → `src/windows`
- `@config` → `src/config`
- `@utils` → `src/utils`
- `@renderer` → `src/platform/renderer`

## 关键配置点

- **工作空间与编辑器路径**：`src/config/index.ts` 的 `vsGoConfig`
  - `workSpaceDirectories`：`~/Desktop/VsGo-Projects` 与 `~/Desktop`
  - `shellConfigFiles`：存在的 `~/.zshrc`、`~/.zprofile`
  - `codeAppPath` / `cursorAppPath`：VS Code / Cursor 应用路径
- **笔记与浏览器新标签首页 URL**：`src/shared/type.ts` 的 `USER_NOTES_YUQUE_URL`
- **环境变量前缀**：主进程使用 `M_VITE_` 前缀（`electron.vite.config.ts` 的 `envPrefix`）

## 约定与注意事项

- **进程边界**：主进程 / 预加载 / 渲染进程三层分离。IPC 逻辑通常按窗口模块组织的 `events.ts`（主进程）与 `ipc.ts`（preload 暴露）。改动 IPC 时保持三端签名一致。
- **别名导入**：优先使用路径别名，而非相对深路径。
- **构建产物**：`out/` 为构建输出；主进程入口为 `./out/main/index.mjs`（见 `package.json` 的 `main`）。
- **平台特性**：以下能力依赖 macOS：
  - `open -a <app>` 打开编辑器/应用
  - 辅助工作区应用检测（`setupWorkSpaceApp.ts`）
  - 托盘图标拷贝（`electron.vite.config.ts` 的 `copyTrayIconPlugin`）
- **window 模块模式**：多数窗口遵循 `store.ts`（状态/持久化）+ `events.ts`（主进程 IPC）+ `ipc.ts`（preload）的拆分，新增窗口建议沿用。
- **桌面访问权限**：对桌面的访问失败会在 `fileManager` 中冷却，避免反复触发 macOS 权限弹窗；改动文件扫描逻辑时保持该行为。
- **配置/路径变动**：涉及扫描目录、编辑器路径、默认 URL 时，务必同时更新 `README.md` 的「配置说明」。
