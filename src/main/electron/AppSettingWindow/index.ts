import { BrowserWindow } from "electron";
import { createSubWindow } from "../createWindow";
import { setupContextMenu } from "../contextMenu";

let appSettingWindow: BrowserWindow | null = null;

export function createAppSettingWindow(): void {
  if (appSettingWindow && !appSettingWindow.isDestroyed()) {
    appSettingWindow.focus();
    return;
  }

  appSettingWindow = createSubWindow({
    width: 480,
    height: 360,
    title: "App 设置",
    hash: "app-setting",
    resizable: false,
  });

  setupContextMenu(appSettingWindow);

  appSettingWindow.on("closed", () => {
    appSettingWindow = null;
  });
}
