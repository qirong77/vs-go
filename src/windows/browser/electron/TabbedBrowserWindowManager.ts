import { screen, BrowserWindow, app } from "electron";
import { vsgoLog } from "@platform/log/logger";
import { TABBED_BROWSER_DEFAULT_HOME_URL } from "@shared/type";
import { TabbedBrowserWindow, type Tab } from "./TabbedBrowserWindow";
import { RemoteBrowserControlWindow } from "./RemoteBrowserControlWindow";

export interface RemoteTargetSelector {
  tabId?: string;
  url?: string;
  windowId?: number;
}

export interface RemoteTarget {
  window: TabbedBrowserWindow;
  tab: Tab;
}

export type RemoteTargetResolution =
  | { ok: true; target: RemoteTarget }
  | {
      ok: false;
      reason: "NO_TARGET" | "NOT_FOUND" | "AMBIGUOUS";
      candidates: RemoteTarget[];
    };

export interface OpenUrlTargetOptions {
  /** 强制创建新窗口，而不是复用最近聚焦窗口。 */
  newWindow?: boolean;
  /** 新窗口是否显示；复用现有窗口时 false 表示不主动 present。 */
  show?: boolean;
}

// ============================================================
// TabbedBrowserWindowManager：管理所有 tabbed 浏览器窗口
// ============================================================

class Manager {
  private windows: TabbedBrowserWindow[] = [];
  private lastFocusedId: number | null = null;
  private isQuitting = false;

  constructor() {
    app.on("before-quit", () => {
      this.isQuitting = true;
    });
  }

  private register(win: TabbedBrowserWindow): void {
    this.windows.push(win);
    win.hostWindow.on("focus", () => {
      this.lastFocusedId = win.hostWindow.id;
    });
    win.hostWindow.on("closed", () => {
      const idx = this.windows.indexOf(win);
      if (idx > -1) this.windows.splice(idx, 1);
      if (this.lastFocusedId === win.hostWindow.id) {
        this.lastFocusedId = this.windows[this.windows.length - 1]?.hostWindow.id ?? null;
      }
      // 远程浏览器控制窗口关闭时不应自动补一个空浏览器窗口
      if (!this.isQuitting && !win.isRemoteControl && this.windows.length === 0) {
        this.createEmpty(TABBED_BROWSER_DEFAULT_HOME_URL, { show: false });
      }
    });
  }

  /** 取最近聚焦的可用窗口；若没有返回 undefined
   *  `excludeRemote` 为 true 时跳过「远程浏览器控制」专属窗口（普通浏览不应复用它）。 */
  private getLastFocusedWindow(excludeRemote = false): TabbedBrowserWindow | undefined {
    if (this.lastFocusedId) {
      const found = this.windows.find(
        (w) => !w.isDestroyed && (!excludeRemote || !w.isRemoteControl) && w.hostWindow.id === this.lastFocusedId
      );
      if (found) return found;
    }
    return this.windows.find((w) => !w.isDestroyed && (!excludeRemote || !w.isRemoteControl));
  }

  /** 取最近聚焦窗口当前激活标签页 URL；若没有返回空字符串 */
  getLastFocusedActiveUrl(): string {
    return this.getLastFocusedWindow()?.getActiveUrl() ?? "";
  }

  /** 所有未销毁的 tabbed 浏览器窗口 */
  getAllWindows(): TabbedBrowserWindow[] {
    return this.windows.filter((w) => !w.isDestroyed);
  }

  /** 枚举所有 URL 匹配候选，可用 windowId 将候选限定在单个窗口。 */
  findRemoteTargetsByUrl(url: string, opts: { windowId?: number } = {}): RemoteTarget[] {
    const wins = this.getAllWindows();
    const scopedWins =
      opts.windowId === undefined ? wins : wins.filter((w) => w.hostWindow.id === opts.windowId);
    return scopedWins.flatMap((window) =>
      window.findTabsByUrl(url).map((tab) => ({ window, tab }))
    );
  }

  /**
   * 严格定位远程操作目标。所有显式提供的条件必须命中同一个 tab：
   * - 没有提供条件时返回 NO_TARGET，由调用方决定是否使用默认目标；
   * - URL 命中多个 tab 时返回 AMBIGUOUS，并附上全部候选；
   * - windowId 单独使用时定位该窗口当前 active tab。
   */
  resolveRemoteTargetStrict(opts: RemoteTargetSelector = {}): RemoteTargetResolution {
    const hasTabId = opts.tabId !== undefined;
    const hasUrl = opts.url !== undefined;
    const hasWindowId = opts.windowId !== undefined;
    if (!hasTabId && !hasUrl && !hasWindowId) {
      return { ok: false, reason: "NO_TARGET", candidates: [] };
    }

    const wins = this.getAllWindows();
    const scopedWins = hasWindowId
      ? wins.filter((w) => w.hostWindow.id === opts.windowId)
      : wins;

    if (hasWindowId && !hasTabId && !hasUrl) {
      const window = scopedWins[0];
      const tab = window?.getActiveTab() ?? window?.getTabs()[0];
      return window && tab
        ? { ok: true, target: { window, tab } }
        : { ok: false, reason: "NOT_FOUND", candidates: [] };
    }

    let candidates: RemoteTarget[] = scopedWins.flatMap((window) =>
      window.getTabs().map((tab) => ({ window, tab }))
    );

    if (hasTabId) {
      candidates = candidates.filter(({ tab }) => tab.id === opts.tabId);
    }

    if (hasUrl) {
      const urlMatches = new Set(
        this.findRemoteTargetsByUrl(opts.url ?? "", {
          windowId: hasWindowId ? opts.windowId : undefined,
        }).map(({ tab }) => tab)
      );
      candidates = candidates.filter(({ tab }) => urlMatches.has(tab));
    }

    if (candidates.length === 0) {
      return { ok: false, reason: "NOT_FOUND", candidates: [] };
    }
    if (candidates.length > 1) {
      return { ok: false, reason: "AMBIGUOUS", candidates };
    }
    return { ok: true, target: candidates[0] };
  }

  /**
   * 兼容旧调用：仅当完全未传目标时回退到首个窗口的 active / 首个 tab。
   * 任意显式条件 NOT_FOUND 或 AMBIGUOUS 时都不会回退。
   */
  resolveRemoteTarget(opts: RemoteTargetSelector = {}): RemoteTarget | null {
    const resolved = this.resolveRemoteTargetStrict(opts);
    if (resolved.ok) return resolved.target;
    if (resolved.reason !== "NO_TARGET") return null;

    const wins = this.getAllWindows();
    if (wins.length === 0) return null;
    const first = wins[0];
    const tab = first.getActiveTab() ?? first.getTabs()[0];
    return tab ? { window: first, tab } : null;
  }

  /** 根据 host BrowserWindow.id 查找对应 TabbedBrowserWindow */
  findByHostId(hostId: number): TabbedBrowserWindow | undefined {
    return this.windows.find((w) => !w.isDestroyed && w.hostWindow.id === hostId);
  }

  /** 当前「远程浏览器控制」专属窗口（不存在则返回 undefined）。 */
  getRemoteControlWindow(): TabbedBrowserWindow | undefined {
    return this.windows.find((w) => !w.isDestroyed && w.isRemoteControl);
  }

  /** 托盘菜单「显示窗口」：把远程控制窗口显示到前台并聚焦（无窗口则忽略）。 */
  showRemoteControlWindow(): void {
    this.getRemoteControlWindow()?.present();
  }

  /** 托盘菜单「隐藏窗口」：把远程控制窗口隐藏到后台（无窗口则忽略）。 */
  hideRemoteControlWindow(): void {
    this.getRemoteControlWindow()?.hide();
  }

  /** 根据 tabId 查找持有该 tab 的窗口 */
  findWindowByTabId(tabId: string): TabbedBrowserWindow | undefined {
    return this.windows.find((w) => !w.isDestroyed && w.hasTab(tabId));
  }

  /** 打开一个 URL：在最近聚焦窗口中新开 tab；若没有窗口则新开窗口 */
  openUrl(url: string): TabbedBrowserWindow {
    const existing = this.getLastFocusedWindow(true);
    if (existing) {
      existing.addTab(url);
      existing.present();
      return existing;
    }
    const win = this.createEmpty(url);
    return win;
  }

  /**
   * 打开 URL 并返回实际创建的 tab/window。新窗口会等待 host renderer ready 后再完成，
   * 因而返回时 tab 已存在，可立即用于精确远程操作。
   */
  async openUrlWithTarget(
    url: string,
    opts: OpenUrlTargetOptions = {}
  ): Promise<RemoteTarget> {
    const existing = opts.newWindow ? undefined : this.getLastFocusedWindow();
    if (existing) {
      const tab = existing.addTab(url);
      if (opts.show !== false) existing.present();
      return { window: existing, tab };
    }
    return this.createEmptyWithTarget(url, { show: opts.show });
  }

  /**
   * 打开一个「远程浏览器控制」专属窗口，并在 host renderer ready 后挂载初始 tab。
   * 该窗口与普通多标签浏览器窗口完全隔离，且「一次最多只有一个」远程控制窗口：
   * 若已存在远程窗口，则复用其当前 tab 并导航到新 URL（远程窗口是单页控制台，不新增 tab）；
   * 否则才新建。复用/新建都由 opts.show 控制是否显示到前台（默认隐藏，后台工作）。
   */
  async openRemoteControlWindow(
    url: string,
    opts: { show?: boolean } = {}
  ): Promise<RemoteTarget> {
    // 一次最多一个远程控制窗口：复用已有窗口，避免重复弹出/堆积不可见标签页。
    const existing = this.windows.find((w) => !w.isDestroyed && w.isRemoteControl);
    if (existing) {
      let tab = existing.getActiveTab() ?? existing.getTabs()[0];
      if (tab) {
        await existing.navigateTab(tab.id, url);
      } else {
        tab = existing.addTab(url);
      }
      if (opts.show !== false) existing.present();
      return { window: existing, tab };
    }
    return new Promise((resolve, reject) => {
      this.createWindowWithInitialTab(
        url,
        opts,
        resolve,
        reject,
        () => new RemoteBrowserControlWindow()
      );
    });
  }

  /** 新建窗口并在 host renderer ready 后返回初始 tab。 */
  createEmptyWithTarget(
    url = TABBED_BROWSER_DEFAULT_HOME_URL,
    opts: { show?: boolean } = {}
  ): Promise<RemoteTarget> {
    return new Promise((resolve, reject) => {
      this.createWindowWithInitialTab(url, opts, resolve, reject);
    });
  }

  /** 新开一个 tabbed 窗口（以 url 作为初始 tab，默认首页） */
  createEmpty(
    url = TABBED_BROWSER_DEFAULT_HOME_URL,
    opts: { show?: boolean } = {}
  ): TabbedBrowserWindow {
    return this.createWindowWithInitialTab(url, opts);
  }

  private createWindowWithInitialTab(
    url: string,
    opts: { show?: boolean },
    onCreated?: (target: RemoteTarget) => void,
    onFailed?: (error: Error) => void,
    createWindow: () => TabbedBrowserWindow = () => new TabbedBrowserWindow()
  ): TabbedBrowserWindow {
    const shouldShow = opts.show !== false;
    const win = createWindow();
    this.register(win);

    const hostContents = win.hostWindow.webContents;
    let settled = false;
    const cleanup = (): void => {
      hostContents.removeListener("did-finish-load", handleReady);
      hostContents.removeListener("did-fail-load", handleLoadFailed);
      hostContents.removeListener("render-process-gone", handleRendererGone);
      win.hostWindow.removeListener("closed", handleClosedBeforeReady);
    };
    const failBeforeReady = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      onFailed?.(error);
    };
    const handleReady = (): void => {
      if (settled) return;
      try {
        const tab = win.addTab(url);
        if (shouldShow) win.present();
        settled = true;
        cleanup();
        onCreated?.({ window: win, tab });
      } catch (error) {
        failBeforeReady(error instanceof Error ? error : new Error(String(error)));
      }
    };
    const handleLoadFailed = (
      _event: Electron.Event,
      errorCode: number,
      errorDescription: string,
      validatedURL: string,
      isMainFrame: boolean
    ): void => {
      if (!isMainFrame) return;
      failBeforeReady(
        new Error(
          `browser host renderer failed to load (${errorCode} ${errorDescription}): ${validatedURL}`
        )
      );
    };
    const handleRendererGone = (
      _event: Electron.Event,
      details: { reason: string }
    ): void => {
      failBeforeReady(new Error(`browser host renderer exited before ready: ${details.reason}`));
    };
    const handleClosedBeforeReady = (): void => {
      failBeforeReady(new Error("browser window closed before initial tab was created"));
    };

    // 等 host 窗口完成 renderer 加载后再挂 tab，避免第一条 STATE_UPDATED 丢失
    hostContents.once("did-finish-load", handleReady);
    if (onFailed) {
      hostContents.on("did-fail-load", handleLoadFailed);
      hostContents.once("render-process-gone", handleRendererGone);
      win.hostWindow.once("closed", handleClosedBeforeReady);
    }
    // 兜底：如果 renderer 已经 ready 并主动请求 state（BROWSER_TAB_GET_STATE），
    // 会直接拿到当前 state；这里不做额外处理。
    return win;
  }

  /** 将 tab 从源窗口剥离，新建一个窗口承接 */
  detachTabToNewWindow(fromWin: TabbedBrowserWindow, tabId: string): TabbedBrowserWindow | null {
    const tab = fromWin.detachTab(tabId);
    if (!tab) return null;

    const win = new TabbedBrowserWindow();
    this.register(win);
    win.hostWindow.webContents.once("did-finish-load", () => {
      win.attachTab(tab);
      win.showAtCursor();
    });
    return win;
  }

  /** 在 [tabId] 所在窗口中调整顺序 */
  reorderTab(tabId: string, toIndex: number): void {
    const win = this.findWindowByTabId(tabId);
    win?.reorderTab(tabId, toIndex);
  }

  // -------------------- 对外生命周期 --------------------

  hideAll(): void {
    const windows = this.normalWindows();
    const visibleCount = windows.filter((w) => w.hostWindow.isVisible()).length;
    windows.forEach((w) => {
      if (w.hostWindow.isVisible()) w.hide();
    });
    if (visibleCount > 0) {
      vsgoLog("Browser", "hideAll", { detail: { visibleCount } });
    }
  }

  showAll(): void {
    const windows = this.normalWindows();
    if (windows.length === 0) {
      this.createEmpty();
      return;
    }
    windows.forEach((w) => {
      if (!w.hostWindow.isVisible()) w.present();
    });
    const last = this.getLastFocusedWindow(true);
    if (last) last.present();
  }

  toggleVisible(): void {
    const anyVisible = this.normalWindows().some((w) => w.hostWindow.isVisible());
    if (anyVisible) {
      this.hideAll();
    } else {
      this.showAll();
    }
  }

  /** 批量显隐只处理普通多标签窗口；「远程浏览器控制」专属窗口仅由托盘菜单控制系统显隐。 */
  private normalWindows(): TabbedBrowserWindow[] {
    return this.windows.filter((w) => !w.isDestroyed && !w.isRemoteControl);
  }

  /** 所有 Tabbed 窗口的地址栏失焦（例如全局 Command+` 切换前后统一清理编辑态） */
  blurAllAddressBars(): void {
    for (const w of this.windows) {
      if (!w.isDestroyed) w.blurAddressBar();
    }
  }

  /** 浮动覆盖层窗口 */
  showOverlay(hostId: number, bounds: { x: number; y: number; width: number; height: number }, content: unknown): void {
    const win = this.findByHostId(hostId);
    win?.showOverlay(bounds, content as never);
  }

  hideOverlay(hostId: number, refocusHost = true): void {
    const win = this.findByHostId(hostId);
    win?.hideOverlay(refocusHost);
  }

  handleOverlayAction(event: Electron.IpcMainEvent, payload: Record<string, unknown>): void {
    const floatWin = BrowserWindow.fromWebContents(event.sender);
    if (!floatWin) return;
    const hostWin = floatWin.getParentWindow();
    if (hostWin) {
      const win = this.findByHostId(hostWin.id);
      win?.handleOverlayAction(payload);
    }
  }

  // 暴露光标屏幕坐标，供 IPC 使用
  getCursorScreenPoint(): Electron.Point {
    return screen.getCursorScreenPoint();
  }
}

export const TabbedBrowserWindowManager = new Manager();
export type { Tab };
