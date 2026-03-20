import { is } from "@electron-toolkit/utils";
import { BrowserWindow } from "electron";
import path from "path";
import { setupContextMenu } from "../contextMenu";

let appSettingWindow: BrowserWindow | null = null;

export function createAppSettingWindow() {
  if (appSettingWindow && !appSettingWindow.isDestroyed()) {
    appSettingWindow.focus();
    return;
  }
  appSettingWindow = new BrowserWindow({
    width: 480,
    height: 360,
    title: "App 设置",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
    autoHideMenuBar: true,
    resizable: false,
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    appSettingWindow.loadURL(process.env["ELECTRON_RENDERER_URL"] + "#/app-setting");
  } else {
    appSettingWindow.loadFile(path.join(__dirname, "../renderer/index.html"), {
      hash: "app-setting",
    });
  }
  setupContextMenu(appSettingWindow);
  appSettingWindow.on("closed", () => {
    appSettingWindow = null;
  });
}
