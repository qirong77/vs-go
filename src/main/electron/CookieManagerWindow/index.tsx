import { BrowserWindow } from "electron";
import path from "path";
import { is } from "@electron-toolkit/utils";

let cookieManagerWindow: BrowserWindow | null = null;

export function createCookieManagerWindow(currentUrl?: string) {
  if (cookieManagerWindow && !cookieManagerWindow.isDestroyed()) {
    cookieManagerWindow.focus();
    if (currentUrl) {
      cookieManagerWindow.webContents.send("update-current-url", currentUrl);
    }
    return cookieManagerWindow;
  }

  cookieManagerWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: "Cookie 管理",
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
      preload: path.join(__dirname, "../preload/index.js"),
    },
  });

  // Load the cookie manager page with hash
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    cookieManagerWindow.loadURL(
      `${process.env["ELECTRON_RENDERER_URL"]}#cookie-manager`
    );
  } else {
    cookieManagerWindow.loadFile(path.join(__dirname, "../renderer/index.html"), {
      hash: "cookie-manager"
    });
  }

  if (currentUrl) {
    cookieManagerWindow.webContents.once("did-finish-load", () => {
      cookieManagerWindow?.webContents.send("update-current-url", currentUrl);
    });
  }

  cookieManagerWindow.on("closed", () => {
    cookieManagerWindow = null;
  });

  return cookieManagerWindow;
}

export function getCookieManagerWindow() {
  return cookieManagerWindow;
}
