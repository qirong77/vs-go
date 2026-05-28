import { BrowserWindow } from "electron";
import path from "node:path";
import { createWindowRef, openManagedSubWindow } from "@platform/electron/managedSubWindow";
import { USER_NOTES_YUQUE_URL } from "@shared/type";

const windowRef = createWindowRef();

export function createUserNotesWindow(): BrowserWindow {
  return openManagedSubWindow(windowRef, {
    width: 1000,
    height: 700,
    title: "笔记",
    hash: "",
    createWindow: () => {
      const window = new BrowserWindow({
        width: 1000,
        height: 700,
        title: "笔记",
        resizable: true,
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, "../preload/index.js"),
          sandbox: false,
          contextIsolation: true,
        },
      });
      void window.loadURL(USER_NOTES_YUQUE_URL);
      return window;
    },
  });
}
