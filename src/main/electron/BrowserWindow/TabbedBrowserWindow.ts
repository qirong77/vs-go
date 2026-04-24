import {
  BrowserWindow,
  WebContentsView,
  app,
  session,
  screen,
  type Rectangle,
  type WebContents,
} from "electron";
import { is } from "@electron-toolkit/utils";
import path from "node:path";
import { VS_GO_EVENT } from "../../../common/EVENT";
import {
  BROWSER_CHROME_HEIGHT,
  TABBED_BROWSER_DEFAULT_HOME_URL,
  type TabState,
  type TabbedBrowserState,
} from "../../../common/type";
import { generateId } from "../../../common/utils";
import { setupContextMenu } from "../contextMenu";
import { windowScriptStore, browserHistoryStore } from "../store";

// ============================================================
// 全局会话设置：一次性去掉 X-Frame-Options / 放宽 CSP，允许嵌入常见页面。
// 复用原 FloatingWindow 行为。
// ============================================================

let sessionInterceptorInstalled = false;
function ensureSessionInterceptor(): void {
  if (sessionInterceptorInstalled) return;
  sessionInterceptorInstalled = true;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    delete responseHeaders["x-frame-options"];
    delete responseHeaders["X-Frame-Options"];
    if (responseHeaders["content-security-policy"] || responseHeaders["Content-Security-Policy"]) {
      responseHeaders["content-security-policy"] = [
        "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;",
      ];
    }
    callback({ cancel: false, responseHeaders });
  });
}

app.whenReady().then(ensureSessionInterceptor);

// ============================================================
// Tab 定义
// ============================================================

export interface Tab {
  id: string;
  view: WebContentsView;
}

function extractFaviconFromFavicons(favicons: string[]): string {
  return favicons?.[0] ?? "";
}

// ============================================================
// 内部 URL（vsgo://xxx）支持
// ============================================================

/** 允许的内部 hash 路由集合（与 renderer/src/entry.tsx ROUTES 中的 key 对应） */
const INTERNAL_ROUTES = new Set(["settings"]);

/** 把 vsgo://xxx 解析为真实的 renderer 页面 URL */
export function resolveInternalUrl(input: string): string | null {
  const match = /^vsgo:\/\/([a-z0-9\-_/]+)$/i.exec((input || "").trim());
  if (!match) return null;
  const route = match[1].replace(/^\/+|\/+$/g, "");
  if (!INTERNAL_ROUTES.has(route)) return null;

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    return `${process.env["ELECTRON_RENDERER_URL"]}#/${route}`;
  }
  // 生产：file:// 路径
  const fileUrl =
    "file://" +
    path
      .join(__dirname, "../renderer/index.html")
      .split(path.sep)
      .map((seg) => encodeURIComponent(seg))
      .join("/")
      .replace(/%3A/g, ":");
  return `${fileUrl}#/${route}`;
}

/** 判断一个真实 URL 是否对应某个内部路由；返回 "vsgo://xxx" 展示串，或 null */
export function toDisplayUrl(realUrl: string): string | null {
  if (!realUrl) return null;
  const hashIdx = realUrl.indexOf("#");
  if (hashIdx === -1) return null;
  const hash = realUrl.slice(hashIdx + 1).replace(/^\/+|\/+$/g, "");
  if (!hash) return null;
  // 只有当路径是我们的 renderer/index.html 或 vite 入口时才视为内部
  const base = realUrl.slice(0, hashIdx);
  const looksInternal =
    base.endsWith("/renderer/index.html") ||
    base.endsWith("/renderer/index.html/") ||
    /localhost(:\d+)?\/?$/.test(base) ||
    base.endsWith("/");
  if (!looksInternal) return null;
  if (!INTERNAL_ROUTES.has(hash)) return null;
  return `vsgo://${hash}`;
}

// ============================================================
// TabbedBrowserWindow：单个外壳窗口 + 多个 WebContentsView(tab)
// ============================================================

export class TabbedBrowserWindow {
  readonly hostWindow: BrowserWindow;
  private tabs: Tab[] = [];
  private activeTabId: string | null = null;
  private closed = false;
  private chromeExtraHeight = 0;

  /** 外部检测：是否正在销毁中，避免空窗口重复清理 */
  get isDestroyed(): boolean {
    return this.closed || this.hostWindow.isDestroyed();
  }

  constructor() {
    ensureSessionInterceptor();

    this.hostWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false,
      title: "VsGo Browser",
      titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
      frame: process.platform !== "darwin",
      webPreferences: {
        preload: path.join(__dirname, "../preload/index.js"),
        sandbox: false,
        contextIsolation: true,
      },
    });

    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      this.hostWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}#/tabbed-browser`);
    } else {
      this.hostWindow.loadFile(path.join(__dirname, "../renderer/index.html"), {
        hash: "/tabbed-browser",
      });
    }

    this.hostWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    this.hostWindow.on("resize", () => this.updateActiveViewBounds());
    this.hostWindow.on("closed", () => this.handleClosed());
    this.hostWindow.webContents.on("before-input-event", (event, input) =>
      this.handleKeyboard(event, input)
    );
  }

  // -------------------- 生命周期 --------------------

  private handleClosed(): void {
    this.closed = true;
    this.tabs.forEach((tab) => {
      try {
        if (!tab.view.webContents.isDestroyed()) {
          tab.view.webContents.close();
        }
      } catch {
        // ignore
      }
    });
    this.tabs = [];
    this.activeTabId = null;
  }

  // -------------------- Tab 创建与事件绑定 --------------------

  addTab(url: string, opts?: { activate?: boolean }): Tab {
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, "../preload/index.js"),
        sandbox: false,
        contextIsolation: false,
      },
    });

    const tab: Tab = { id: generateId("tab"), view };
    this.tabs.push(tab);

    this.bindTabEvents(tab);

    const resolvedInternal = resolveInternalUrl(url);
    const target = resolvedInternal ?? normalizeUrlOrSearch(url);
    if (resolvedInternal) {
      view.webContents.loadURL(target).catch((err) => {
        console.error("[TabbedBrowserWindow] 内部页面 loadURL 失败:", err);
      });
    } else {
      view.webContents.loadURL(target).catch((err) => {
        console.error("[TabbedBrowserWindow] loadURL 失败:", err);
      });
    }

    if (opts?.activate !== false) {
      this.switchTab(tab.id);
    } else {
      this.broadcastState();
    }
    view.webContents.on('did-finish-load', () => {
      this.hostWindow.webContents.focus();
      this.focusAddressBar();
    });
    return tab;
  }

  /** 附加一个已经存在的 tab（来自 detach），不会重新 loadURL。 */
  attachTab(tab: Tab, opts?: { index?: number; activate?: boolean }): void {
    this.bindTabEvents(tab);
    if (opts?.index !== undefined) {
      this.tabs.splice(Math.max(0, Math.min(opts.index, this.tabs.length)), 0, tab);
    } else {
      this.tabs.push(tab);
    }
    if (opts?.activate !== false) {
      this.switchTab(tab.id);
    } else {
      this.broadcastState();
    }
  }

  /** 把一个 tab 从本窗口剥离下来；调用者负责挂到其他窗口或销毁。 */
  detachTab(tabId: string): Tab | null {
    const index = this.tabs.findIndex((t) => t.id === tabId);
    if (index === -1) return null;
    const tab = this.tabs[index];

    try {
      this.hostWindow.contentView.removeChildView(tab.view);
    } catch {
      // 未被挂载时抛错，忽略
    }

    this.tabs.splice(index, 1);
    this.unbindTabEvents(tab);

    if (this.activeTabId === tabId) {
      const fallback = this.tabs[Math.min(index, this.tabs.length - 1)];
      this.activeTabId = fallback ? fallback.id : null;
      if (fallback) this.switchTab(fallback.id);
    }

    if (this.tabs.length === 0 && !this.closed) {
      // 最后一个 tab 被拖走 → 关闭窗口（Chrome 行为）
      this.hostWindow.close();
    } else {
      this.broadcastState();
    }
    return tab;
  }

  closeTab(tabId: string): void {
    const index = this.tabs.findIndex((t) => t.id === tabId);
    if (index === -1) return;
    const tab = this.tabs[index];

    try {
      this.hostWindow.contentView.removeChildView(tab.view);
    } catch {
      // ignore
    }
    this.unbindTabEvents(tab);
    if (!tab.view.webContents.isDestroyed()) {
      tab.view.webContents.close();
    }
    this.tabs.splice(index, 1);

    if (this.tabs.length === 0) {
      this.hostWindow.close();
      return;
    }

    if (this.activeTabId === tabId) {
      const fallback = this.tabs[Math.min(index, this.tabs.length - 1)];
      this.activeTabId = fallback ? fallback.id : null;
      if (fallback) this.switchTab(fallback.id);
    } else {
      this.broadcastState();
    }
  }

  switchTab(tabId: string, opts?: { focusPage?: boolean }): void {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    // 移除全部挂载的 child views，再挂上目标 tab
    for (const t of this.tabs) {
      try {
        this.hostWindow.contentView.removeChildView(t.view);
      } catch {
        // ignore
      }
    }

    this.hostWindow.contentView.addChildView(tab.view);
    this.activeTabId = tab.id;
    // 切 tab 时立刻收回地址栏下拉预留高度，避免 renderer 异步 suggest 曾把 chromeExtraHeight 顶高后未复位
    this.chromeExtraHeight = 0;
    this.updateActiveViewBounds();
    this.broadcastState();
  }

  navigateActive(url: string): void {
    const tab = this.getActiveTab();
    if (!tab) {
      this.addTab(url);
      return;
    }
    const target = resolveInternalUrl(url) ?? normalizeUrlOrSearch(url);
    tab.view.webContents.loadURL(target).catch((err) => {
      console.error("[TabbedBrowserWindow] 导航失败:", err);
    });
  }

  reorderTab(tabId: string, toIndex: number): void {
    const from = this.tabs.findIndex((t) => t.id === tabId);
    if (from === -1) return;
    const [tab] = this.tabs.splice(from, 1);
    const target = Math.max(0, Math.min(toIndex, this.tabs.length));
    this.tabs.splice(target, 0, tab);
    this.broadcastState();
  }

  goBack(): void {
    const wc = this.getActiveTab()?.view.webContents;
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }

  goForward(): void {
    const wc = this.getActiveTab()?.view.webContents;
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  }

  reload(): void {
    this.getActiveTab()?.view.webContents.reload();
  }

  toggleDevTools(): void {
    const wc = this.getActiveTab()?.view.webContents;
    wc?.toggleDevTools();
  }

  focusAddressBar(): void {
    if (!this.hostWindow.isDestroyed()) {
      this.hostWindow.webContents.send(VS_GO_EVENT.BROWSER_TAB_FOCUS_ADDRESS);
    }
  }

  // -------------------- 查询 --------------------

  getActiveTab(): Tab | undefined {
    if (!this.activeTabId) return undefined;
    return this.tabs.find((t) => t.id === this.activeTabId);
  }

  hasTab(tabId: string): boolean {
    return this.tabs.some((t) => t.id === tabId);
  }

  getTabs(): Tab[] {
    return this.tabs.slice();
  }

  getState(): TabbedBrowserState {
    return {
      tabs: this.tabs.map((t) => this.buildTabState(t)),
      activeTabId: this.activeTabId,
    };
  }

  // -------------------- 内部工具 --------------------

  private buildTabState(tab: Tab): TabState {
    const wc = tab.view.webContents;
    const destroyed = wc.isDestroyed();
    const realUrl = destroyed ? "" : wc.getURL();
    const displayUrl = toDisplayUrl(realUrl);
    const rawTitle = destroyed ? "" : wc.getTitle();
    // 内部页面默认标题
    const internalTitleMap: Record<string, string> = {
      "vsgo://settings": "设置",
    };
    const title =
      (displayUrl && internalTitleMap[displayUrl]) ||
      rawTitle ||
      displayUrl ||
      realUrl ||
      "新标签页";
    return {
      id: tab.id,
      url: displayUrl ?? realUrl,
      title,
      favicon: (tab.view as unknown as { __favicon?: string }).__favicon ?? "",
      loading: destroyed ? false : wc.isLoading(),
      canGoBack: destroyed ? false : wc.navigationHistory.canGoBack(),
      canGoForward: destroyed ? false : wc.navigationHistory.canGoForward(),
    };
  }

  private broadcastState(): void {
    if (this.closed || this.hostWindow.isDestroyed()) return;
    this.hostWindow.webContents.send(VS_GO_EVENT.BROWSER_TAB_STATE_UPDATED, this.getState());
  }

  /** 临时调整 WebContentsView 的顶部偏移，用于地址栏下拉展开时让出空间 */
  setChromePadding(extraHeight: number): void {
    this.chromeExtraHeight = Math.max(0, extraHeight);
    this.updateActiveViewBounds();
  }

  private updateActiveViewBounds(): void {
    const tab = this.getActiveTab();
    if (!tab || this.hostWindow.isDestroyed()) return;
    const [width, height] = this.hostWindow.getContentSize();
    const topY = BROWSER_CHROME_HEIGHT + this.chromeExtraHeight;
    const bounds: Rectangle = {
      x: 0,
      y: topY,
      width,
      height: Math.max(0, height - topY),
    };
    tab.view.setBounds(bounds);
  }

  private bindTabEvents(tab: Tab): void {
    const wc = tab.view.webContents;
    const sync = (): void => this.broadcastState();

    const onTitle = (_e: Electron.Event, title: string): void => {
      // 更新外壳窗口标题为"标题 - 域名"
      try {
        const url = wc.getURL();
        const domain = (() => {
          try {
            return new URL(url).host;
          } catch {
            return "";
          }
        })();
        if (this.activeTabId === tab.id && !this.hostWindow.isDestroyed()) {
          this.hostWindow.setTitle(domain ? `${title} - ${domain}` : title);
        }
      } catch {
        // ignore
      }
      sync();
    };

    const onFavicon = (_e: Electron.Event, favicons: string[]): void => {
      (tab.view as unknown as { __favicon?: string }).__favicon =
        extractFaviconFromFavicons(favicons);
      sync();
    };

    const onFinish = (): void => {
      runUserScript(wc);
      const finishUrl = wc.getURL();
      const finishTitle = wc.getTitle();
      if (finishUrl) browserHistoryStore.add(finishUrl, finishTitle);
      sync();
    };

    const handlers: Array<[string, (...args: unknown[]) => void]> = [
      ["did-navigate", sync],
      ["did-navigate-in-page", sync],
      ["page-title-updated", onTitle as never],
      ["page-favicon-updated", onFavicon as never],
      ["did-start-loading", sync],
      ["did-stop-loading", sync],
      ["did-finish-load", onFinish],
      ["did-fail-load", sync],
    ];
    for (const [evt, fn] of handlers) {
      wc.on(evt as never, fn as never);
    }
    (tab.view as unknown as { __handlers?: typeof handlers }).__handlers = handlers;

    // window.open → 本窗口新 tab
    wc.setWindowOpenHandler(({ url }) => {
      this.addTab(url);
      return { action: "deny" };
    });

    // 快捷键转发
    wc.on("before-input-event", (event, input) => this.handleKeyboard(event, input));

    setupContextMenu(tab.view, {
      onOpenSettings: () => this.addTab("vsgo://settings"),
    });
  }

  private unbindTabEvents(tab: Tab): void {
    const wc = tab.view.webContents;
    if (wc.isDestroyed()) return;
    const handlers = (
      tab.view as unknown as {
        __handlers?: Array<[string, (...args: unknown[]) => void]>;
      }
    ).__handlers;
    if (handlers) {
      for (const [evt, fn] of handlers) {
        wc.removeListener(evt as never, fn as never);
      }
    }
  }

  private handleKeyboard(event: Electron.Event, input: Electron.Input): void {
    if (input.type !== "keyDown") return;
    const meta = process.platform === "darwin" ? input.meta : input.control;
    if (!meta) return;

    // Cmd+R / Ctrl+R：刷新当前标签页。默认快捷键会重载外壳 webContents，导致整窗 UI 重载。
    if (input.code === "KeyR" && !input.alt) {
      event.preventDefault();
      const wc = this.getActiveTab()?.view.webContents;
      if (!wc || wc.isDestroyed()) return;
      if (input.shift) {
        wc.reloadIgnoringCache();
      } else {
        wc.reload();
      }
      return;
    }

    if (input.code === "KeyI" && input.alt) {
      event.preventDefault();
      this.toggleDevTools();
      const currentWebContents = this.hostWindow.webContents;
      setTimeout(() => {
        currentWebContents.focus();
      }, 500);
      return;
    }

    // Cmd+W / Ctrl+W：多标签时只关当前 tab；仅剩一个 tab 时 closeTab 会关掉整个窗口
    if (input.code === "KeyW" && !input.alt) {
      event.preventDefault();
      const active = this.getActiveTab();
      if (active) {
        this.closeTab(active.id);
      } else {
        this.hostWindow.close();
      }
      return;
    }
  }

  // -------------------- 窗口显示控制 --------------------

  showAtCursor(): void {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const [w] = this.hostWindow.getSize();
    const x = Math.max(display.workArea.x, cursor.x - Math.floor(w / 2));
    const y = Math.max(display.workArea.y, cursor.y - 20);
    this.hostWindow.setPosition(x, y);
    this.present();
  }

  present(): void {
    if (this.hostWindow.isDestroyed()) return;
    if (!this.hostWindow.isVisible()) this.hostWindow.show();
    this.hostWindow.focus();
    // 将焦点转移到活动 tab 的页面，避免外壳 webContents 把焦点还给地址栏 input
    const activeTab = this.getActiveTab();
    if (activeTab && !activeTab.view.webContents.isDestroyed()) {
      activeTab.view.webContents.focus();
    }
  }

  hide(): void {
    if (!this.hostWindow.isDestroyed()) this.hostWindow.hide();
  }
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 地址栏输入规整：
 * - 已包含 scheme 的直接使用
 * - 看起来像 "xxx.yyy" 的域名/IP/localhost 自动补 https://
 * - 否则走 Google 搜索
 */
export function normalizeUrlOrSearch(input: string): string {
  const trimmed = (input || "").trim();
  if (!trimmed) return TABBED_BROWSER_DEFAULT_HOME_URL;

  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(trimmed)) return trimmed;
  if (/^about:|^chrome:|^file:/.test(trimmed)) return trimmed;

  const looksLikeHost =
    /^localhost(:\d+)?(\/.*)?$/i.test(trimmed) ||
    /^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(trimmed) ||
    /^[^\s]+\.[^\s]+$/.test(trimmed);

  if (looksLikeHost && !/\s/.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function runUserScript(webContents: WebContents): void {
  const script = windowScriptStore.get().trim();
  if (!script) return;
  webContents.executeJavaScript(script, false).catch((err) => {
    console.error("[TabbedBrowserWindow] 用户脚本执行失败:", err);
  });
}
