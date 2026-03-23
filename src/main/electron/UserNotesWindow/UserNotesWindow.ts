import { BrowserWindow } from "electron";
import { createSubWindow } from "../createWindow";

let userNotesWindow: BrowserWindow | null = null;

export function createUserNotesWindow(): BrowserWindow {
  if (userNotesWindow && !userNotesWindow.isDestroyed()) {
    userNotesWindow.focus();
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

  return userNotesWindow;
}

export function getUserNotesWindow(): BrowserWindow | null {
  return userNotesWindow;
}
