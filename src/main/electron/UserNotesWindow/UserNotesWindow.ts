import { BrowserWindow } from "electron";
import path from "path";
import { is } from "@electron-toolkit/utils";

let userNotesWindow: BrowserWindow | null = null;

export function createUserNotesWindow() {
  if (userNotesWindow && !userNotesWindow.isDestroyed()) {
    userNotesWindow.focus();
    return userNotesWindow;
  }

  userNotesWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: "用户笔记",
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
      preload: path.join(__dirname, "../preload/index.js"),
    },
  });

  // Load the user notes page with hash
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    userNotesWindow.loadURL(
      `${process.env["ELECTRON_RENDERER_URL"]}#user-notes`
    );
  } else {
    userNotesWindow.loadFile(path.join(__dirname, "../renderer/index.html"), {
      hash: "user-notes"
    });
  }

  userNotesWindow.on("closed", () => {
    userNotesWindow = null;
  });

  return userNotesWindow;
}

export function getUserNotesWindow() {
  return userNotesWindow;
}
