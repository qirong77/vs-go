import { BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { VS_GO_EVENT } from "../../../common/EVENT";
import { TabbedBrowserWindowManager } from "./TabbedBrowserWindowManager";
import type { TabbedBrowserWindow } from "./TabbedBrowserWindow";

// ============================================================
// 通过 ipc 事件发起方的 webContents 反查外壳窗口
// ============================================================

function getSenderWindow(
  event: IpcMainEvent | IpcMainInvokeEvent
): TabbedBrowserWindow | undefined {
  const host = BrowserWindow.fromWebContents(event.sender);
  if (!host) return undefined;
  return TabbedBrowserWindowManager.findByHostId(host.id);
}

// ============================================================
// 注册所有 BROWSER_TAB_* handler
// ============================================================

export function registerTabbedBrowserHandlers(): void {
  ipcMain.handle(VS_GO_EVENT.BROWSER_TAB_GET_STATE, (event) => {
    const win = getSenderWindow(event);
    return win ? win.getState() : { tabs: [], activeTabId: null };
  });

  ipcMain.on(VS_GO_EVENT.BROWSER_TAB_NEW, (event, payload: { url?: string } = {}) => {
    const win = getSenderWindow(event);
    win?.addTab(payload.url || "https://www.google.com");
  });

  ipcMain.on(VS_GO_EVENT.BROWSER_TAB_CLOSE, (event, tabId: string) => {
    const win = getSenderWindow(event);
    win?.closeTab(tabId);
  });

  ipcMain.on(VS_GO_EVENT.BROWSER_TAB_SWITCH, (event, tabId: string) => {
    const win = getSenderWindow(event);
    win?.switchTab(tabId);
  });

  ipcMain.on(
    VS_GO_EVENT.BROWSER_TAB_NAVIGATE,
    (event, payload: { url: string; mode?: "current" | "new" }) => {
      const win = getSenderWindow(event);
      if (!win) return;
      if (payload.mode === "new") {
        win.addTab(payload.url);
      } else {
        win.navigateActive(payload.url);
      }
    }
  );

  ipcMain.on(VS_GO_EVENT.BROWSER_TAB_BACK, (event) => {
    getSenderWindow(event)?.goBack();
  });

  ipcMain.on(VS_GO_EVENT.BROWSER_TAB_FORWARD, (event) => {
    getSenderWindow(event)?.goForward();
  });

  ipcMain.on(VS_GO_EVENT.BROWSER_TAB_RELOAD, (event) => {
    getSenderWindow(event)?.reload();
  });

  ipcMain.on(
    VS_GO_EVENT.BROWSER_TAB_REORDER,
    (event, payload: { tabId: string; toIndex: number }) => {
      const win = getSenderWindow(event);
      if (!win) return;
      win.reorderTab(payload.tabId, payload.toIndex);
    }
  );

  ipcMain.on(VS_GO_EVENT.BROWSER_TAB_DETACH, (event, tabId: string) => {
    const fromWin = getSenderWindow(event);
    if (!fromWin) return;
    TabbedBrowserWindowManager.detachTabToNewWindow(fromWin, tabId);
  });

  ipcMain.on(VS_GO_EVENT.BROWSER_TAB_TOGGLE_DEVTOOLS, (event) => {
    getSenderWindow(event)?.toggleDevTools();
  });
}

registerTabbedBrowserHandlers();
