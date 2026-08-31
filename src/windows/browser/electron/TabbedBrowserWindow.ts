import {
  BrowserWindow,
  WebContentsView,
  screen,
  type Rectangle,
  type WebContents,
} from "electron";
import { is } from "@electron-toolkit/utils";
import path from "node:path";
import { BrowserOverlayEvent, BrowserTabEvent, BrowserWindowEvent } from "../events";
import {
  BROWSER_CHROME_HEIGHT,
  REMOTE_BROWSER_CHROME_HEIGHT,
  TABBED_BROWSER_DEFAULT_HOME_URL,
  type TabState,
  type TabbedBrowserState,
  type OverlayContentPayload,
  type OverlayBounds,
  type OverlayType,
  getOverlayWindowBounds,
} from "@shared/type";
import { generateId } from "@shared/utils";
import { setupContextMenu } from "@platform/electron/contextMenu";
import {
  prepareWindowForActiveSpace,
  schedulePinWindowToActiveSpace,
} from "@platform/electron/macosWorkspace";
import { windowScriptStore } from "@windows/script-editor/store";
import { browserStore } from "../store";
import { injectLocalStorageForWebContents } from "./chrome-sync-server";
import { remoteBrowserDebugger } from "./remote-browser-debugger";

// ============================================================
// Tab 定义
// ============================================================

export interface Tab {
  id: string;
  view: WebContentsView;
  kind: "internal" | "external";
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

function isTrustedInternalUrl(input: string): boolean {
  if (resolveInternalUrl(input)) return true;
  try {
    const candidate = new URL(input).href;
    return Array.from(INTERNAL_ROUTES).some((route) => {
      const resolved = resolveInternalUrl(`vsgo://${route}`);
      return resolved !== null && new URL(resolved).href === candidate;
    });
  } catch {
    return false;
  }
}

/** 远程（LLM）操作命中后，标签栏指示点保持点亮的时间窗（毫秒） */
const REMOTE_ACTIVITY_WINDOW_MS = 8_000;

function isSafeExternalPageUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      (parsed.protocol === "about:" && parsed.href === "about:blank")
    );
  } catch {
    return false;
  }
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
  private overlayWindow: BrowserWindow | null = null;
  private overlayBounds: OverlayBounds | null = null;
  /** 窗口首次加载期间缓存的待发送内容，加载完成后立即投递 */
  private overlayPendingContent: OverlayContentPayload | null = null;
  private overlayType: OverlayType | null = null;
  /** 主窗口 / 标签页点击时关闭浮层（网页区域收不到 chrome 的 document 事件） */
  private overlayOutsideDismissCleanups: Array<() => void> = [];
  private layoutSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private overlayWarmupTimer: ReturnType<typeof setTimeout> | null = null;
  /** 各 tab 最近一次被远程（LLM）操作的毫秒时间戳 */
  private tabRemoteActivityAt = new Map<string, number>();
  /** 指示点熄灭用的定时器，按 tabId 保存 */
  private tabRemoteActivityTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** 是否为「远程浏览器控制」专属窗口 */
  private readonly remoteControlMode: boolean = false;

  /** 该窗口是否为「远程浏览器控制」专属窗口（供管理器/渲染层区分） */
  get isRemoteControl(): boolean {
    return this.remoteControlMode;
  }

  /** 页面视图顶部的 Chrome 外壳高度：普通窗口为完整外壳，远程窗口为紧凑横幅 */
  get chromeHeight(): number {
    return this.remoteControlMode ? REMOTE_BROWSER_CHROME_HEIGHT : BROWSER_CHROME_HEIGHT;
  }

  /** 外部检测：是否正在销毁中，避免空窗口重复清理 */
  get isDestroyed(): boolean {
    return this.closed || this.hostWindow.isDestroyed();
  }

  constructor(options: { remoteControl?: boolean } = {}) {
    this.remoteControlMode = options.remoteControl === true;
    this.hostWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false,
      title: this.remoteControlMode ? "远程浏览器控制" : "VsGo Browser",
      backgroundColor: this.remoteControlMode ? "#10141f" : undefined,
      titleBarStyle: this.remoteControlMode
        ? undefined
        : process.platform === "darwin"
          ? "hiddenInset"
          : "default",
      frame: this.remoteControlMode ? false : process.platform !== "darwin",
      fullscreenable: this.remoteControlMode ? true : process.platform !== "darwin",
      minWidth: 760,
      minHeight: 460,
      webPreferences: {
        preload: path.join(__dirname, "../preload/index.js"),
        sandbox: false,
        contextIsolation: true,
      },
    });

    const route = this.remoteControlMode ? "remote-browser-control" : "tabbed-browser";
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      this.hostWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}#/${route}`);
    } else {
      this.hostWindow.loadFile(path.join(__dirname, "../renderer/index.html"), {
        hash: `/${route}`,
      });
    }

    this.hostWindow.on("resize", () => this.scheduleWindowLayoutSync());
    this.hostWindow.on("maximize", () => this.handleWindowZoomChanged());
    this.hostWindow.on("unmaximize", () => this.handleWindowZoomChanged());
    this.hostWindow.on("restore", () => this.handleWindowZoomChanged());
    this.hostWindow.on("blur", () => this.handleHostWindowBlur());
    this.hostWindow.on("closed", () => this.handleClosed());
    this.hostWindow.on("enter-full-screen", () => {
      this.hideOverlay();
      this.broadcastFullscreen(true);
      this.scheduleWindowLayoutSync();
    });
    this.hostWindow.on("leave-full-screen", () => {
      this.hideOverlay();
      this.broadcastFullscreen(false);
      this.scheduleWindowLayoutSync();
    });
    this.hostWindow.on("move", () => this.repositionOverlay());
    this.hostWindow.on("minimize", () => this.hideOverlay());
    this.hostWindow.webContents.on("before-input-event", (event, input) =>
      this.handleKeyboard(event, input)
    );
    this.hostWindow.webContents.once("did-finish-load", () => this.scheduleOverlayWarmup());
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

    // 销毁浮动覆盖层窗口
    try {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.close();
      }
    } catch {
      // ignore
    }
    this.overlayWindow = null;
    if (this.layoutSyncTimer) {
      clearTimeout(this.layoutSyncTimer);
      this.layoutSyncTimer = null;
    }
    if (this.overlayWarmupTimer) {
      clearTimeout(this.overlayWarmupTimer);
      this.overlayWarmupTimer = null;
    }
    this.clearAllRemoteActivityTimers();
  }

  // -------------------- Tab 创建与事件绑定 --------------------

  private createTabView(kind: Tab["kind"]): WebContentsView {
    return new WebContentsView({
      webPreferences:
        kind === "internal"
          ? {
              preload: path.join(__dirname, "../preload/index.js"),
              sandbox: false,
              contextIsolation: false,
              backgroundThrottling: false,
            }
          : {
              // 外部页面不能获得 VsGo 的 preload/ipcRenderer。主进程仍可通过
              // WebContents/CDP 完成远程调试，不需要把 Electron API 暴露给页面。
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false,
              backgroundThrottling: false,
            },
    });
  }

  private async replaceTabView(
    tab: Tab,
    kind: Tab["kind"],
    targetUrl: string
  ): Promise<void> {
    const wasActive = this.activeTabId === tab.id;
    const previousView = tab.view;
    this.unbindTabEvents(tab);
    try {
      this.hostWindow.contentView.removeChildView(previousView);
    } catch {
      // The view may be a background tab and therefore not attached.
    }

    const nextView = this.createTabView(kind);
    tab.view = nextView;
    tab.kind = kind;
    this.bindTabEvents(tab);
    if (this.overlayOutsideDismissCleanups.length > 0) {
      this.overlayOutsideDismissCleanups.push(
        this.attachOverlayOutsideDismissToWebContents(nextView.webContents)
      );
    }
    if (wasActive) {
      this.hostWindow.contentView.addChildView(nextView);
      this.updateActiveViewBounds();
    }
    if (!previousView.webContents.isDestroyed()) previousView.webContents.close();
    await nextView.webContents.loadURL(targetUrl);
    this.broadcastState();
  }

  addTab(url: string, opts?: { activate?: boolean }): Tab {
    const kind = isTrustedInternalUrl(url) ? "internal" : "external";
    const view = this.createTabView(kind);
    const tab: Tab = { id: generateId("tab"), view, kind };
    this.tabs.push(tab);

    this.bindTabEvents(tab);
    if (this.overlayOutsideDismissCleanups.length > 0) {
      this.overlayOutsideDismissCleanups.push(
        this.attachOverlayOutsideDismissToWebContents(tab.view.webContents)
      );
    }

    const resolvedInternal = resolveInternalUrl(url);
    const normalizedExternal = resolvedInternal ? null : normalizeUrlOrSearch(url);
    const target = resolvedInternal ??
      (normalizedExternal && isSafeExternalPageUrl(normalizedExternal)
        ? normalizedExternal
        : "about:blank");
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

    this.clearRemoteActivityTimer(tabId);
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

  switchTab(tabId: string, _opts?: { focusPage?: boolean }): void {
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
    this.updateActiveViewBounds();
    this.broadcastState();
  }

  navigateActive(url: string): void {
    const tab = this.getActiveTab();
    if (!tab) {
      this.addTab(url);
      return;
    }
    this.navigateTab(tab.id, url).catch((err) => {
      console.error("[TabbedBrowserWindow] 导航失败:", err);
    });
  }

  /** 直接导航指定 tab；不会切换 active tab。 */
  async navigateTab(tabId: string, url: string): Promise<void> {
    const tab = this.getTabById(tabId);
    if (!tab) throw new Error("tab not found or destroyed");
    const resolvedInternal = resolveInternalUrl(url);
    const nextKind = isTrustedInternalUrl(url) ? "internal" : "external";
    const target = resolvedInternal ?? normalizeUrlOrSearch(url);
    if (nextKind === "external" && !isSafeExternalPageUrl(target)) {
      throw new Error(`navigation protocol is not allowed: ${target}`);
    }
    if (tab.kind !== nextKind) {
      await this.replaceTabView(tab, nextKind, target);
      return;
    }
    const wc = this.getTabWebContents(tabId);
    if (!wc) throw new Error("tab not found or destroyed");
    await wc.loadURL(target);
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
    const tab = this.getActiveTab();
    if (tab && this.getTabWebContents(tab.id)) this.goBackTab(tab.id);
  }

  goForward(): void {
    const tab = this.getActiveTab();
    if (tab && this.getTabWebContents(tab.id)) this.goForwardTab(tab.id);
  }

  reload(): void {
    const tab = this.getActiveTab();
    if (tab && this.getTabWebContents(tab.id)) this.reloadTab(tab.id);
  }

  /** 后退指定 tab；不会切换 active tab。返回是否实际发起了后退。 */
  goBackTab(tabId: string): boolean {
    const wc = this.getTabWebContents(tabId);
    if (!wc) throw new Error("tab not found or destroyed");
    if (!wc.navigationHistory.canGoBack()) return false;
    wc.navigationHistory.goBack();
    return true;
  }

  /** 前进指定 tab；不会切换 active tab。返回是否实际发起了前进。 */
  goForwardTab(tabId: string): boolean {
    const wc = this.getTabWebContents(tabId);
    if (!wc) throw new Error("tab not found or destroyed");
    if (!wc.navigationHistory.canGoForward()) return false;
    wc.navigationHistory.goForward();
    return true;
  }

  /** 刷新指定 tab；不会切换 active tab。 */
  reloadTab(tabId: string): void {
    const wc = this.getTabWebContents(tabId);
    if (!wc) throw new Error("tab not found or destroyed");
    wc.reload();
  }

  toggleDevTools(): void {
    const wc = this.getActiveTab()?.view.webContents;
    wc?.toggleDevTools();
  }

  focusAddressBar(): void {
    if (!this.hostWindow.isDestroyed()) {
      this.hostWindow.webContents.send(BrowserTabEvent.BROWSER_TAB_FOCUS_ADDRESS);
    }
  }

  blurAddressBar(): void {
    if (!this.hostWindow.isDestroyed()) {
      this.hostWindow.webContents.send(BrowserTabEvent.BROWSER_TAB_BLUR_ADDRESS);
    }
  }

  // -------------------- 查询 --------------------

  getActiveTab(): Tab | undefined {
    if (!this.activeTabId) return undefined;
    return this.tabs.find((t) => t.id === this.activeTabId);
  }

  getActiveUrl(): string {
    const wc = this.getActiveTab()?.view.webContents;
    if (!wc || wc.isDestroyed()) return "";
    return toDisplayUrl(wc.getURL()) ?? wc.getURL();
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
      remoteControl: this.remoteControlMode,
    };
  }

  // -------------------- Remote / HTTP 桥接操作 --------------------
  // 这些方法专供 remote-browser-server 使用：通过编程式注入输入事件与 JS，
  // 无需系统级真实鼠标，不抢夺其它应用 focus。

  getTabById(tabId: string): Tab | undefined {
    return this.tabs.find((t) => t.id === tabId);
  }

  /** 按 URL 枚举 tab（忽略 hash 与尾部斜杠，保留 query）。 */
  findTabsByUrl(match: string): Tab[] {
    const normalized = normalizeUrlForApiMatch(match);
    if (!normalized) return [];
    const matches: Tab[] = [];
    for (const t of this.tabs) {
      const wc = t.view.webContents;
      if (!wc || wc.isDestroyed()) continue;
      const realUrl = wc.getURL();
      const displayUrl = toDisplayUrl(realUrl);
      if (
        normalizeUrlForApiMatch(realUrl) === normalized ||
        (displayUrl !== null && normalizeUrlForApiMatch(displayUrl) === normalized)
      ) {
        matches.push(t);
      }
    }
    return matches;
  }

  /** 按 URL 匹配第一个 tab；保留给现有调用方。 */
  findTabByUrl(match: string): Tab | null {
    return this.findTabsByUrl(match)[0] ?? null;
  }

  /** 返回指定 tab 的 webContents；不存在或已销毁返回 null */
  getTabWebContents(tabId: string): WebContents | null {
    const wc = this.getTabById(tabId)?.view.webContents;
    return wc && !wc.isDestroyed() ? wc : null;
  }

  /** 在指定 tab 执行 JS */
  async evaluateOnTab(
    tabId: string,
    script: string,
    opts?: { userGesture?: boolean }
  ): Promise<unknown> {
    const wc = this.getTabWebContents(tabId);
    if (!wc) throw new Error("tab not found or destroyed");
    return wc.executeJavaScript(script, opts?.userGesture ?? false);
  }

  /**
   * 截取指定 tab 的页面，返回 PNG(base64) 与尺寸。
   * 传递 stayHidden 以支持窗口隐藏/最小化时仍能捕获内容
   * （页面视为可见的判定依赖 capturer count，配合 backgroundThrottling:false）。
   */
  async captureTab(
    tabId: string,
    opts?: { stayHidden?: boolean }
  ): Promise<{ width: number; height: number; dataUrl: string; base64: string }> {
    const wc = this.getTabWebContents(tabId);
    if (!wc) throw new Error("tab not found or destroyed");
    const image = await wc.capturePage(undefined, { stayHidden: opts?.stayHidden !== false });
    const { width, height } = image.getSize();
    const base64 = image.toPNG().toString("base64");
    const dataUrl = `data:image/png;base64,${base64}`;
    return { width, height, dataUrl, base64 };
  }

  /** 向指定 tab 注入合成输入事件（虚拟鼠标/键盘）。focus 时仅聚焦 VsGo 自身窗口。 */
  sendInputToTab(
    tabId: string,
    event: Electron.MouseInputEvent | Electron.MouseWheelInputEvent | Electron.KeyboardInputEvent,
    opts?: { focus?: boolean }
  ): void {
    const wc = this.getTabWebContents(tabId);
    if (!wc) throw new Error("tab not found or destroyed");
    if (opts?.focus) this.focusTab(tabId);
    wc.sendInputEvent(event);
  }

  /** 让指定 tab 获得焦点以接收键盘输入。只聚焦 VsGo 自己的窗口，不动系统其它 focus。 */
  focusTab(tabId: string): void {
    const wc = this.getTabWebContents(tabId);
    if (!wc) throw new Error("tab not found or destroyed");
    const active = this.getActiveTab();
    if (active?.id !== tabId) this.switchTab(tabId);
    if (!this.hostWindow.isDestroyed()) {
      if (!this.hostWindow.isVisible()) this.hostWindow.show();
      this.hostWindow.focus();
    }
    wc.focus();
  }

  // -------------------- 内部工具 --------------------

  /**
   * 标记某个 tab 正在被远程（LLM）操作，并点亮标签栏指示点。
   * 在 `REMOTE_ACTIVITY_WINDOW_MS` 之后自动熄灭（在此期间再次操作会重新计时）。
   */
  notifyRemoteActivity(tabId: string): void {
    if (this.closed || this.hostWindow.isDestroyed()) return;
    if (!this.tabs.some((t) => t.id === tabId)) return;
    const now = Date.now();
    this.tabRemoteActivityAt.set(tabId, now);
    const existing = this.tabRemoteActivityTimers.get(tabId);
    if (existing) clearTimeout(existing);
    this.tabRemoteActivityTimers.set(
      tabId,
      setTimeout(() => {
        this.tabRemoteActivityTimers.delete(tabId);
        const startedAt = this.tabRemoteActivityAt.get(tabId);
        if (startedAt !== undefined && startedAt + REMOTE_ACTIVITY_WINDOW_MS <= Date.now()) {
          this.tabRemoteActivityAt.delete(tabId);
        }
        this.broadcastState();
      }, REMOTE_ACTIVITY_WINDOW_MS + 50),
    );
    this.broadcastState();
  }

  /** 清除单个 tab 的远程活动指示（关 tab / 销毁前调用） */
  private clearRemoteActivityTimer(tabId: string): void {
    const timer = this.tabRemoteActivityTimers.get(tabId);
    if (timer) {
      clearTimeout(timer);
      this.tabRemoteActivityTimers.delete(tabId);
    }
    this.tabRemoteActivityAt.delete(tabId);
  }

  /** 清除全部远程活动指示（窗口销毁前调用） */
  private clearAllRemoteActivityTimers(): void {
    for (const timer of this.tabRemoteActivityTimers.values()) clearTimeout(timer);
    this.tabRemoteActivityTimers.clear();
    this.tabRemoteActivityAt.clear();
  }

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
      remoteActive: (this.tabRemoteActivityAt.get(tab.id) ?? 0) + REMOTE_ACTIVITY_WINDOW_MS > Date.now(),
    };
  }

  private broadcastState(): void {
    if (this.closed || this.hostWindow.isDestroyed()) return;
    this.hostWindow.webContents.send(BrowserTabEvent.BROWSER_TAB_STATE_UPDATED, this.getState());
  }

  /** WebContentsView 顶部偏移，避开 Chrome 外壳 */
  private updateActiveViewBounds(): void {
    const tab = this.getActiveTab();
    if (!tab || this.hostWindow.isDestroyed()) return;
    const [width, height] = this.hostWindow.getContentSize();
    const topY = this.chromeHeight;
    const bounds: Rectangle = {
      x: 0,
      y: topY,
      width,
      height: Math.max(0, height - topY),
    };
    tab.view.setBounds(bounds);
  }

  private syncWindowLayout(): void {
    this.updateActiveViewBounds();
    this.repositionOverlay();
  }

  private scheduleWindowLayoutSync(): void {
    this.syncWindowLayout();
    if (this.layoutSyncTimer) clearTimeout(this.layoutSyncTimer);
    this.layoutSyncTimer = setTimeout(() => {
      this.layoutSyncTimer = null;
      this.syncWindowLayout();
    }, 80);
  }

  private handleWindowZoomChanged(): void {
    this.hideOverlay();
    this.scheduleWindowLayoutSync();
  }

  // -------------------- 浮动覆盖层窗口 --------------------

  private overlayTypeNeedsKeyboard(type: OverlayType): boolean {
    return (
      type === "bookmark-star" ||
      type === "folder-dropdown" ||
      type === "context-menu" ||
      type === "confirm-dialog" ||
      type === "name-dialog" ||
      type === "history-list"
    );
  }

  private overlayTypeDismissesOnBlur(type: OverlayType | null): boolean {
    return type === "folder-dropdown" || type === "context-menu" || type === "history-list";
  }

  private dismissOverlayFromBlur(): void {
    if (!this.isOverlayVisible()) return;
    if (!this.overlayTypeDismissesOnBlur(this.overlayType)) return;
    this.handleOverlayAction({ action: "dismiss-overlay", refocusHost: false });
  }

  private handleHostWindowBlur(): void {
    if (this.overlayType !== "history-list") return;
    setTimeout(() => {
      if (this.overlayType !== "history-list") return;
      if (!this.isOverlayVisible()) return;

      const focusedWindow = BrowserWindow.getFocusedWindow();
      if (
        focusedWindow &&
        this.overlayWindow &&
        !this.overlayWindow.isDestroyed() &&
        focusedWindow.id === this.overlayWindow.id
      ) {
        return;
      }

      this.dismissOverlayFromBlur();
    }, 0);
  }

  private scheduleOverlayWarmup(): void {
    if (this.closed || this.hostWindow.isDestroyed()) return;
    if (this.overlayWarmupTimer) clearTimeout(this.overlayWarmupTimer);
    this.overlayWarmupTimer = setTimeout(() => {
      this.overlayWarmupTimer = null;
      if (this.closed || this.hostWindow.isDestroyed()) return;
      this.ensureOverlayWindow();
    }, 300);
  }

  private presentOverlayWindow(needsKeyboard: boolean): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;
    if (needsKeyboard) {
      if (!this.overlayWindow.isVisible()) {
        this.overlayWindow.show();
      }
      this.overlayWindow.focus();
      this.overlayWindow.webContents.focus();
    } else if (!this.overlayWindow.isVisible()) {
      this.overlayWindow.showInactive();
    }
  }

  showOverlay(bounds: OverlayBounds, content: OverlayContentPayload): void {
    this.overlayBounds = bounds;
    this.overlayType = content.type;
    this.ensureOverlayWindow();
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;

    this.applyOverlayWindowBounds();
    const needsKeyboard = this.overlayTypeNeedsKeyboard(content.type);

    if (this.overlayWindow.webContents.isLoading()) {
      // 页面还在加载，先缓存内容，等 did-finish-load 后再发送
      this.overlayPendingContent = content;
    } else {
      this.overlayWindow.webContents.send(BrowserOverlayEvent.BROWSER_OVERLAY_CONTENT, content);
      this.presentOverlayWindow(needsKeyboard);
    }
    this.installOverlayOutsideDismiss();
  }

  hideOverlay(refocusHost = true): void {
    this.clearOverlayOutsideDismiss();
    const focusedWindow = BrowserWindow.getFocusedWindow();
    const shouldFocusHost =
      refocusHost &&
      (focusedWindow?.id === this.hostWindow.id ||
        (!!this.overlayWindow &&
          !this.overlayWindow.isDestroyed() &&
          focusedWindow?.id === this.overlayWindow.id));
    try {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.hide();
      }
    } catch {
      // ignore
    }
    this.overlayBounds = null;
    this.overlayType = null;
    if (shouldFocusHost && !this.hostWindow.isDestroyed()) {
      this.hostWindow.focus();
      this.hostWindow.webContents.focus();
    }
  }

  private isOverlayVisible(): boolean {
    return !!(
      this.overlayWindow &&
      !this.overlayWindow.isDestroyed() &&
      this.overlayWindow.isVisible()
    );
  }

  private isPointerInsideOverlayWindow(point: Electron.Point): boolean {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return false;
    const b = this.overlayWindow.getBounds();
    return point.x >= b.x && point.x < b.x + b.width && point.y >= b.y && point.y < b.y + b.height;
  }

  private tryDismissOverlayFromOutsidePointer(): void {
    if (!this.isOverlayVisible()) return;
    if (this.isPointerInsideOverlayWindow(screen.getCursorScreenPoint())) return;
    this.handleOverlayAction({
      action: "dismiss-overlay",
      refocusHost: this.overlayType !== "history-list",
    });
  }

  private readonly onOverlayOutsideBeforeInput = (
    _event: Electron.Event,
    input: Electron.Input
  ): void => {
    if (input.type === "mouseDown") this.tryDismissOverlayFromOutsidePointer();
  };

  private attachOverlayOutsideDismissToWebContents(wc: WebContents): () => void {
    const onInputEvent = (_event: Electron.Event, inputEvent: Electron.InputEvent): void => {
      if (inputEvent.type === "mouseDown") this.tryDismissOverlayFromOutsidePointer();
    };
    wc.on("before-input-event", this.onOverlayOutsideBeforeInput);
    wc.on("input-event", onInputEvent);
    return () => {
      if (!wc.isDestroyed()) {
        wc.removeListener("before-input-event", this.onOverlayOutsideBeforeInput);
        wc.removeListener("input-event", onInputEvent);
      }
    };
  }

  private installOverlayOutsideDismiss(): void {
    this.clearOverlayOutsideDismiss();
    // 标签页区域：用屏幕坐标判断点击是否在浮层窗外（WebContentsView 上 document 事件不可靠）
    // chrome 区域：由 BookmarkChromeBar 的 capture 阶段 mousedown 处理（含星标排除）
    this.overlayOutsideDismissCleanups = this.tabs.map((tab) =>
      this.attachOverlayOutsideDismissToWebContents(tab.view.webContents)
    );
  }

  private clearOverlayOutsideDismiss(): void {
    for (const cleanup of this.overlayOutsideDismissCleanups) cleanup();
    this.overlayOutsideDismissCleanups = [];
  }

  handleOverlayAction(payload: Record<string, unknown>): void {
    if (this.closed || this.hostWindow.isDestroyed()) return;
    this.hostWindow.webContents.send(BrowserOverlayEvent.BROWSER_OVERLAY_ACTION, payload);
  }

  private ensureOverlayWindow(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) return;

    const win = new BrowserWindow({
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      focusable: true,
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      show: false,
      parent: this.hostWindow,
      webPreferences: {
        preload: path.join(__dirname, "../preload/index.js"),
        sandbox: false,
        contextIsolation: true,
      },
    });

    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      win.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}#/floating-overlay`);
    } else {
      win.loadFile(path.join(__dirname, "../renderer/index.html"), {
        hash: "/floating-overlay",
      });
    }

    win.webContents.on("did-finish-load", () => {
      if (this.overlayPendingContent && this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        const pending = this.overlayPendingContent;
        this.overlayWindow.webContents.send(BrowserOverlayEvent.BROWSER_OVERLAY_CONTENT, pending);
        this.overlayPendingContent = null;
        this.presentOverlayWindow(this.overlayTypeNeedsKeyboard(pending.type));
        this.installOverlayOutsideDismiss();
      }
    });

    win.on("blur", () => {
      setTimeout(() => {
        if (this.overlayTypeDismissesOnBlur(this.overlayType)) {
          this.dismissOverlayFromBlur();
        } else {
          this.tryDismissOverlayFromOutsidePointer();
        }
      }, 0);
    });

    win.on("closed", () => {
      this.overlayWindow = null;
      this.overlayPendingContent = null;
    });

    this.overlayWindow = win;
  }

  private applyOverlayWindowBounds(): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;
    if (!this.overlayBounds || !this.overlayType) return;

    const windowBounds = getOverlayWindowBounds(this.overlayBounds, this.overlayType);
    const hostContentBounds = this.hostWindow.getContentBounds();

    this.overlayWindow.setBounds({
      x: Math.round(hostContentBounds.x + windowBounds.x),
      y: Math.round(hostContentBounds.y + windowBounds.y),
      width: Math.round(windowBounds.width),
      height: Math.round(windowBounds.height),
    });
  }

  private repositionOverlay(): void {
    this.applyOverlayWindowBounds();
  }

  private bindTabEvents(tab: Tab): void {
    const wc = tab.view.webContents;
    remoteBrowserDebugger.observeTab(tab.id, wc);
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
          const base = domain ? `${title} - ${domain}` : title;
          this.hostWindow.setTitle(this.remoteControlMode ? `远程浏览器控制 · ${base}` : base);
        }
      } catch {
        // ignore
      }
      this.updateHistoryMetadata(tab);
      sync();
    };

    const onFavicon = (_e: Electron.Event, favicons: string[]): void => {
      (tab.view as unknown as { __favicon?: string }).__favicon =
        extractFaviconFromFavicons(favicons);
      this.updateHistoryMetadata(tab);
      sync();
    };

    const onStartLoading = (): void => {
      this.scheduleOverlayWarmup();
      sync();
    };

    const onWillNavigate = (
      details: Electron.Event & { url?: string; isMainFrame?: boolean },
      legacyUrl?: string,
      _legacyIsInPlace?: boolean,
      legacyIsMainFrame?: boolean
    ): void => {
      const destination = details.url ?? legacyUrl ?? "";
      const isMainFrame = details.isMainFrame ?? legacyIsMainFrame ?? true;
      if (!destination || !isMainFrame) return;
      if (tab.kind === "external" && !isSafeExternalPageUrl(destination)) {
        details.preventDefault();
        return;
      }
      const destinationKind: Tab["kind"] = isTrustedInternalUrl(destination)
        ? "internal"
        : "external";
      if (destinationKind === tab.kind) return;
      details.preventDefault();
      void this.navigateTab(tab.id, destination).catch((error) => {
        console.error("[TabbedBrowserWindow] 安全上下文切换失败:", error);
      });
    };

    const onFinish = (): void => {
      runUserScript(wc);
      injectLocalStorageForWebContents(wc);
      this.recordHistory(tab);
      this.scheduleOverlayWarmup();
      sync();
    };

    const handlers: Array<[string, (...args: unknown[]) => void]> = [
      ["did-navigate", sync],
      ["did-navigate-in-page", sync],
      ["will-navigate", onWillNavigate as never],
      ["will-redirect", onWillNavigate as never],
      ["page-title-updated", onTitle as never],
      ["page-favicon-updated", onFavicon as never],
      ["did-start-loading", onStartLoading],
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
      if (isSafeExternalPageUrl(url)) this.addTab(url);
      return { action: "deny" };
    });

    // 快捷键转发
    wc.on("before-input-event", (event, input) => this.handleKeyboard(event, input));

    setupContextMenu(tab.view, {
      onOpenSettings: () => this.addTab("vsgo://settings"),
    });
  }

  private recordHistory(tab: Tab): void {
    const wc = tab.view.webContents;
    if (wc.isDestroyed()) return;
    const item = this.buildHistoryInput(tab);
    if (item) browserStore.addHistory(item);
  }

  private updateHistoryMetadata(tab: Tab): void {
    const wc = tab.view.webContents;
    if (wc.isDestroyed()) return;
    const item = this.buildHistoryInput(tab);
    if (item) browserStore.updateHistoryMetadata(item);
  }

  private buildHistoryInput(tab: Tab): { url: string; title: string; favicon: string } | null {
    const wc = tab.view.webContents;
    if (wc.isDestroyed()) return null;
    const displayUrl = toDisplayUrl(wc.getURL()) ?? wc.getURL();
    const url = displayUrl.trim();
    if (!url) return null;
    return {
      url,
      title: wc.getTitle() || url,
      favicon: (tab.view as unknown as { __favicon?: string }).__favicon ?? "",
    };
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
    const wasVisible = this.hostWindow.isVisible();
    if (!wasVisible) {
      prepareWindowForActiveSpace(this.hostWindow);
      schedulePinWindowToActiveSpace(this.hostWindow);
    }
    if (!this.hostWindow.isVisible()) {
      if (process.platform === "darwin") {
        this.hostWindow.showInactive();
      } else {
        this.hostWindow.show();
      }
    }
    this.scheduleWindowLayoutSync();
    if (process.platform === "darwin") {
      setTimeout(() => {
        if (!this.hostWindow.isDestroyed()) this.hostWindow.focus();
      }, 0);
    }
  }

  hide(): void {
    if (!this.hostWindow.isDestroyed()) this.hostWindow.hide();
  }

  /** 供 remote-browser-server 在窗口隐藏时恢复可见并聚焦。 */
  showAndFocus(): void {
    if (this.hostWindow.isDestroyed()) return;
    if (!this.hostWindow.isVisible()) this.hostWindow.show();
    this.hostWindow.focus();
  }

  /** 供 remote-browser-server 检查窗口当前可见性。 */
  isWindowVisible(): boolean {
    return !this.hostWindow.isDestroyed() && this.hostWindow.isVisible();
  }

  isFullScreen(): boolean {
    return !this.hostWindow.isDestroyed() && this.hostWindow.isFullScreen();
  }

  exitFullscreen(): void {
    if (!this.hostWindow.isDestroyed() && this.hostWindow.isFullScreen()) {
      this.hostWindow.setFullScreen(false);
    }
  }

  toggleFullscreen(): void {
    if (!this.hostWindow.isDestroyed()) {
      this.hostWindow.setFullScreen(!this.hostWindow.isFullScreen());
    }
  }

  minimizeWindow(): void {
    if (!this.hostWindow.isDestroyed()) {
      if (this.hostWindow.isFullScreen()) this.hostWindow.setFullScreen(false);
      this.hostWindow.minimize();
    }
  }

  closeWindow(): void {
    if (!this.hostWindow.isDestroyed()) this.hostWindow.close();
  }

  private broadcastFullscreen(isFullscreen: boolean): void {
    if (this.closed || this.hostWindow.isDestroyed()) return;
    this.hostWindow.webContents.send(
      BrowserWindowEvent.BROWSER_WINDOW_FULLSCREEN_CHANGED,
      isFullscreen
    );
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

/**
 * URL 规整用于 tab 匹配（remote-browser-server 定位 tab 的依据）：
 * 忽略 hash 与尾部斜杠，host 转小写，保留 query 与 protocol。
 */
export function normalizeUrlForApiMatch(input: string): string {
  const trimmed = (input || "").trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

/** 用 try/catch 包裹用户脚本，避免 DOM 未命中等运行时错误以 Uncaught 形式污染页面控制台 */
export function wrapUserScriptForExecution(script: string): string {
  const serialized = JSON.stringify(script);
  return `(function(){
  try {
    const fn = new Function(${serialized});
    fn();
  } catch (e) {
    console.error("[VsGo 用户脚本]", e);
  }
})();`;
}

function runUserScript(webContents: WebContents): void {
  const script = windowScriptStore.get().trim();
  if (!script) return;
  webContents.executeJavaScript(wrapUserScriptForExecution(script), false).catch((err) => {
    console.error("[TabbedBrowserWindow] 用户脚本执行失败:", err);
  });
}
