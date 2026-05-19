import type { BrowserWindow } from "electron";
import { CookieEvent } from "@windows/cookie-manager/events";
import { createWindowRef, openManagedSubWindow } from "@platform/electron/managedSubWindow";

const windowRef = createWindowRef();

function sendCurrentUrl(window: BrowserWindow, currentUrl?: string): void {
  if (!currentUrl) return;
  window.webContents.send(CookieEvent.COOKIE_UPDATE_CURRENT_URL, currentUrl);
}

export function createCookieManagerWindow(currentUrl?: string): BrowserWindow {
  const window = openManagedSubWindow(windowRef, {
    width: 800,
    height: 600,
    title: "Cookie 管理",
    hash: "cookie-manager",
    contextMenu: false,
    onReuse: (w) => sendCurrentUrl(w, currentUrl),
    onCreated: (w) => {
      if (currentUrl) {
        w.webContents.once("did-finish-load", () => sendCurrentUrl(w, currentUrl));
      }
    },
  });

  return window;
}

export function getCookieManagerWindow(): BrowserWindow | null {
  return windowRef.current;
}
