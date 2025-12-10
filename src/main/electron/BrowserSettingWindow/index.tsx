import { is } from "@electron-toolkit/utils";
import { BrowserWindow } from "electron";
import path from "path";

let browserSettingWindow: BrowserWindow | null = null;
export function createBrowserSettingWindow() {
  if (browserSettingWindow && !browserSettingWindow.isDestroyed()) {
    browserSettingWindow.focus();
    return;
  }
  browserSettingWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: "浏览器设置",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
    autoHideMenuBar: true,
    resizable: true,
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    browserSettingWindow.loadURL(process.env["ELECTRON_RENDERER_URL"] + "#/browser-setting");
  } else {
    browserSettingWindow.loadFile(path.join(__dirname, "../renderer/index.html"), {
      hash: "browser-setting",
    });
  }
  browserSettingWindow.on("closed", () => {
    browserSettingWindow = null;
  });
}
