import { BrowserWindow } from "electron";
import { createSubWindow, presentWindowOnCurrentDesktop } from "../createWindow";

let userNotesWindow: BrowserWindow | null = null;

export function createUserNotesWindow(): BrowserWindow {
  if (userNotesWindow && !userNotesWindow.isDestroyed()) {
    presentWindowOnCurrentDesktop(userNotesWindow);
    return userNotesWindow;
  }

  userNotesWindow = createSubWindow({
    width: 1000,
    height: 700,
    title: "用户笔记",
    hash: "user-notes",
  });

  userNotesWindow.on("closed", () => {
    userNotesWindow = null;
  });

  presentWindowOnCurrentDesktop(userNotesWindow);
  return userNotesWindow;
}

export function getUserNotesWindow(): BrowserWindow | null {
  return userNotesWindow;
}

/**
 * 与 MainWindowManager.toggleIsShowMainWindow 相同结构：
 * 无实例则创建后 present；可见则 hide；否则 center + show + focus。
 */
export function toggleUserNotesWindow(): void {
  if (!userNotesWindow || userNotesWindow.isDestroyed()) {
    createUserNotesWindow();
    return;
  }

  if (userNotesWindow.isVisible()) {
    userNotesWindow.hide();
  } else {
    presentWindowOnCurrentDesktop(userNotesWindow);
  }
}
