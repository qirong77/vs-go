import { BrowserWindow } from "electron";
import { createSubWindow, presentWindowOnCurrentDesktop } from "../createWindow";
import { setupContextMenu } from "../contextMenu";

let appSettingWindow: BrowserWindow | null = null;

export function createAppSettingWindow(): void {
  if (appSettingWindow && !appSettingWindow.isDestroyed()) {
    presentWindowOnCurrentDesktop(appSettingWindow);
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

  presentWindowOnCurrentDesktop(appSettingWindow);
}
