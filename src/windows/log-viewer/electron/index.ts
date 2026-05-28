import type { BrowserWindow } from "electron";
import { createWindowRef, openManagedSubWindow } from "@platform/electron/managedSubWindow";
import { vsgoLog } from "@platform/log/logger";
import { subscribeLogViewer } from "@platform/log/buffer";

const windowRef = createWindowRef();

export function createLogWindow(): BrowserWindow {
  vsgoLog("LogViewer", "打开日志窗口");
  return openManagedSubWindow(windowRef, {
    width: 900,
    height: 560,
    title: "VsGo 日志",
    hash: "log-viewer",
    onCreated: (window) => {
      window.webContents.on("did-finish-load", () => {
        subscribeLogViewer(window.webContents);
      });
    },
    onReuse: (window) => {
      subscribeLogViewer(window.webContents);
    },
  });
}
