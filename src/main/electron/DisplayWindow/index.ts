import { BrowserWindow } from "electron";
import { createSubWindow, presentWindowOnCurrentDesktop } from "../createWindow";

let displayWindow: BrowserWindow | null = null;

export function createDisplayWindow(): void {
  if (displayWindow && !displayWindow.isDestroyed()) {
    presentWindowOnCurrentDesktop(displayWindow);
    return;
  }

  displayWindow = createSubWindow({
    width: 720,
    height: 520,
    title: "屏幕管理",
    hash: "display-manager",
    resizable: true,
  });

  displayWindow.on("closed", () => {
    displayWindow = null;
  });

  presentWindowOnCurrentDesktop(displayWindow);
}
