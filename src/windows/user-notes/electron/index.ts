import type { BrowserWindow } from "electron";
import { presentWindowOnCurrentDesktop } from "@platform/electron/createWindow";
import { createWindowRef, openManagedSubWindow } from "@platform/electron/managedSubWindow";

const windowRef = createWindowRef();

export function createUserNotesWindow(): BrowserWindow {
  return openManagedSubWindow(windowRef, {
    width: 1000,
    height: 700,
    title: "用户笔记",
    hash: "user-notes",
    contextMenu: false,
  });
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
