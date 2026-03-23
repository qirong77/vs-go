import { BrowserWindow } from "electron";
import { VS_GO_EVENT } from "../../../common/EVENT";
import { createSubWindow } from "../createWindow";

let cookieManagerWindow: BrowserWindow | null = null;

export function createCookieManagerWindow(currentUrl?: string): BrowserWindow {
  if (cookieManagerWindow && !cookieManagerWindow.isDestroyed()) {
    cookieManagerWindow.focus();
    if (currentUrl) {
      cookieManagerWindow.webContents.send(VS_GO_EVENT.COOKIE_UPDATE_CURRENT_URL, currentUrl);
    }
    return cookieManagerWindow;
  }

  cookieManagerWindow = createSubWindow({
    width: 800,
    height: 600,
    title: "Cookie 管理",
    hash: "cookie-manager",
  });

  if (currentUrl) {
    cookieManagerWindow.webContents.once("did-finish-load", () => {
      cookieManagerWindow?.webContents.send(VS_GO_EVENT.COOKIE_UPDATE_CURRENT_URL, currentUrl);
    });
  }

  cookieManagerWindow.on("closed", () => {
    cookieManagerWindow = null;
  });

  return cookieManagerWindow;
}

export function getCookieManagerWindow(): BrowserWindow | null {
  return cookieManagerWindow;
}
