import { BrowserWindow } from "electron";
import { createSubWindow, presentWindowOnCurrentDesktop } from "../createWindow";
import { setupContextMenu } from "../contextMenu";

let browserSettingWindow: BrowserWindow | null = null;

export function createBrowserSettingWindow(): void {
  if (browserSettingWindow && !browserSettingWindow.isDestroyed()) {
    presentWindowOnCurrentDesktop(browserSettingWindow);
    return;
  }

  browserSettingWindow = createSubWindow({
    width: 800,
    height: 600,
    title: "浏览器设置",
    hash: "browser-setting",
  });

  setupContextMenu(browserSettingWindow);

  browserSettingWindow.on("closed", () => {
    browserSettingWindow = null;
  });

  presentWindowOnCurrentDesktop(browserSettingWindow);
}
