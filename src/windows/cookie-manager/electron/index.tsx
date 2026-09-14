import type { BrowserWindow } from "electron";
import { CookieEvent } from "@windows/cookie-manager/events";
import { createWindowRef, openManagedSubWindow } from "@platform/electron/managedSubWindow";
import { onActiveTabUrlChange } from "@platform/electron/activeTabUrl";

const windowRef = createWindowRef();

/** 允许空字符串：表示当前没有可用页面，渲染端据此清空并禁用操作 */
function sendCurrentUrl(window: BrowserWindow, currentUrl?: string): void {
  if (currentUrl === undefined) return;
  window.webContents.send(CookieEvent.COOKIE_UPDATE_CURRENT_URL, currentUrl);
}

let unsubscribeActiveUrl: (() => void) | null = null;

/** 让已打开的 Cookie 管理窗口实时跟随浏览器当前 tab，而不是停留在打开时的 URL */
function ensureActiveUrlSubscription(): void {
  if (unsubscribeActiveUrl) return;
  unsubscribeActiveUrl = onActiveTabUrlChange((url) => {
    const window = windowRef.current;
    if (!window || window.isDestroyed()) return;
    sendCurrentUrl(window, url);
  });
}

export function createCookieManagerWindow(currentUrl?: string): BrowserWindow {
  ensureActiveUrlSubscription();
  const window = openManagedSubWindow(windowRef, {
    width: 800,
    height: 600,
    title: "Cookie 管理",
    hash: "cookie-manager",
    contextMenu: false,
    onReuse: (w) => sendCurrentUrl(w, currentUrl),
    onCreated: (w) => {
      w.webContents.once("did-finish-load", () => sendCurrentUrl(w, currentUrl));
    },
  });

  return window;
}

export function getCookieManagerWindow(): BrowserWindow | null {
  return windowRef.current;
}
