# VsGo Cookie & Storage Sync（Chrome 扩展）

把 Chrome 浏览器里的 **Cookie** 和 **localStorage** 自动同步到 VsGo，让 VsGo 的
Tabbed Browser 直接复用 Chrome 的登录态与页面缓存数据（例如访问已登录的站点时
无需重新登录）。

## 工作原理

```
Chrome 扩展 (chrome-sync-extension/)
  ├─ chrome.cookies.getAll()         → 读取全部 Cookie
  └─ chrome.scripting.executeScript  → 逐个标签页读取 localStorage
        │
        ▼  POST http://127.0.0.1:18765/sync
VsGo 主进程 (src/windows/browser/electron/chrome-sync-server.ts)
  ├─ session.defaultSession.cookies.set()   → Cookie 立即生效
  ├─ 保存 localStorage 快照 → 页面加载完成后注入
  └─ 落盘 chrome-sync/latest.json → 重启 VsGo 自动恢复
```

- 同步地址默认 `http://127.0.0.1:18765/sync`（可用环境变量 `VSGO_CHROME_SYNC_PORT`
  修改端口，扩展侧在弹窗中修改地址）。
- 扩展在 **Cookie 变化**、**标签页加载完成**、**定时（每分钟）**时自动去抖同步，
  也可在弹窗里点击「立即同步」。

## 安装

1. 打开 Chrome，访问 `chrome://extensions`；
2. 打开右上角「开发者模式」；
3. 点击「加载已解压的扩展程序」，选择本目录
   （`vs-go/chrome-sync-extension`）；
4. 启动 VsGo（`npm run dev`），扩展会自动开始同步；
5. 点击扩展图标可查看上次同步状态、手动触发同步、开关自动同步。

## 说明与限制

- **Cookie**：通过 `chrome.cookies` API 读取，包含 HttpOnly 与 Secure Cookie。
- **localStorage**：仅能读取 **当前已打开标签页** 的 localStorage（浏览器安全
  限制，未打开过的网站无法读取）。若希望某个网站的数据被同步，先在 Chrome 中
  打开该网站一次，再点「立即同步」。
- **不包含**：IndexedDB、CacheStorage、Service Worker 缓存、会话历史等，这些
  不在本扩展同步范围内。
- 同步数据会写入项目根目录 `chrome-sync/latest.json`（已被 `.gitignore` 忽略，
  请勿提交，其中包含敏感凭据）。
- 未启动 VsGo 时扩展会同步失败并记录状态；启动 VsGo 后下个周期会自动重试。

## 常见问题

**Q: 扩展显示同步失败？**
检查 VsGo 是否已启动、端口是否被占用（`lsof -i :18765`），以及在弹窗中确认
同步地址与 VsGo 端口一致。

**Q: 同步后 VsGo 里还是没登录态？**
Cookie 在页面刷新/重新导航后生效；localStorage 需要目标页面加载完成后注入，
尝试在 VsGo 中刷新一次页面。
