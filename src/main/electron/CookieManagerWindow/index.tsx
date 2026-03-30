import { BrowserWindow } from "electron";
import { VS_GO_EVENT } from "../../../common/EVENT";
import { createSubWindow, presentWindowOnCurrentDesktop } from "../createWindow";

let cookieManagerWindow: BrowserWindow | null = null;

export function createCookieManagerWindow(currentUrl?: string): BrowserWindow {
  if (cookieManagerWindow && !cookieManagerWindow.isDestroyed()) {
    presentWindowOnCurrentDesktop(cookieManagerWindow);
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

  presentWindowOnCurrentDesktop(cookieManagerWindow);
  return cookieManagerWindow;
}

export function getCookieManagerWindow(): BrowserWindow | null {
  return cookieManagerWindow;
}
