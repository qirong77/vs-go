import { screen } from "electron";
import { TabbedBrowserWindow, type Tab } from "./TabbedBrowserWindow";

// ============================================================
// TabbedBrowserWindowManager：管理所有 tabbed 浏览器窗口
// ============================================================

class Manager {
  private windows: TabbedBrowserWindow[] = [];
  private lastFocusedId: number | null = null;

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
    });
  }

  /** 取最近聚焦的可用窗口；若没有返回 undefined */
  private getLastFocusedWindow(): TabbedBrowserWindow | undefined {
    if (this.lastFocusedId) {
      const found = this.windows.find(
        (w) => !w.isDestroyed && w.hostWindow.id === this.lastFocusedId
      );
      if (found) return found;
    }
    return this.windows.find((w) => !w.isDestroyed);
  }

  /** 根据 host BrowserWindow.id 查找对应 TabbedBrowserWindow */
  findByHostId(hostId: number): TabbedBrowserWindow | undefined {
    return this.windows.find((w) => !w.isDestroyed && w.hostWindow.id === hostId);
  }

  /** 根据 tabId 查找持有该 tab 的窗口 */
  findWindowByTabId(tabId: string): TabbedBrowserWindow | undefined {
    return this.windows.find((w) => !w.isDestroyed && w.hasTab(tabId));
  }

  /** 打开一个 URL：在最近聚焦窗口中新开 tab；若没有窗口则新开窗口 */
  openUrl(url: string): TabbedBrowserWindow {
    const existing = this.getLastFocusedWindow();
    if (existing) {
      existing.addTab(url);
      existing.present();
      return existing;
    }
    const win = this.createEmpty(url);
    return win;
  }

  /** 新开一个 tabbed 窗口（以 url 作为初始 tab，默认首页） */
  createEmpty(url = "https://www.google.com"): TabbedBrowserWindow {
    const win = new TabbedBrowserWindow();
    this.register(win);
    // 等 host 窗口完成 renderer 加载后再挂 tab，避免第一条 STATE_UPDATED 丢失
    win.hostWindow.webContents.once("did-finish-load", () => {
      win.addTab(url);
      win.present();
    });
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
    this.windows.forEach((w) => {
      if (!w.isDestroyed && w.hostWindow.isVisible()) w.hide();
    });
  }

  showAll(): void {
    if (this.windows.length === 0) {
      this.createEmpty();
      return;
    }
    this.windows.forEach((w) => {
      if (!w.isDestroyed && !w.hostWindow.isVisible()) w.present();
    });
    const last = this.getLastFocusedWindow();
    if (last) last.present();
  }

  toggleVisible(): void {
    const anyVisible = this.windows.some((w) => !w.isDestroyed && w.hostWindow.isVisible());
    if (anyVisible) {
      this.hideAll();
    } else {
      this.showAll();
    }
  }

  /** 根据 host BrowserWindow id 临时扩展 Chrome 高度 */
  setChromePadding(hostId: number, extraHeight: number): void {
    const win = this.findByHostId(hostId);
    win?.setChromePadding(extraHeight);
  }

  // 暴露光标屏幕坐标，供 IPC 使用
  getCursorScreenPoint(): Electron.Point {
    return screen.getCursorScreenPoint();
  }
}

export const TabbedBrowserWindowManager = new Manager();
export type { Tab };
