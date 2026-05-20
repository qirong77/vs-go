import { BrowserWindow } from "electron";
import path from "node:path";
import { presentWindowOnCurrentDesktop } from "@platform/electron/createWindow";
import { createWindowRef } from "@platform/electron/managedSubWindow";
import { USER_NOTES_YUQUE_URL } from "@shared/type";

const windowRef = createWindowRef();

function openUserNotesBrowserWindow(): BrowserWindow {
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

  window.on("closed", () => {
    windowRef.current = null;
  });

  windowRef.current = window;
  presentWindowOnCurrentDesktop(window);
  return window;
}

export function createUserNotesWindow(): BrowserWindow {
  if (windowRef.current && !windowRef.current.isDestroyed()) {
    presentWindowOnCurrentDesktop(windowRef.current);
    return windowRef.current;
  }
  return openUserNotesBrowserWindow();
}

export function getUserNotesWindow(): BrowserWindow | null {
  return windowRef.current;
}

/** 无实例则创建；可见则 hide，否则 present */
export function toggleUserNotesWindow(): void {
  if (!windowRef.current || windowRef.current.isDestroyed()) {
    createUserNotesWindow();
    return;
  }

  if (windowRef.current.isVisible()) {
    windowRef.current.hide();
  } else {
    presentWindowOnCurrentDesktop(windowRef.current);
  }
}
