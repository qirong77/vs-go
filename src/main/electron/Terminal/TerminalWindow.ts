import { is } from "@electron-toolkit/utils";
import { BrowserWindow } from "electron";
import path from "path";

export function createTerminalWindow() {
  const window = new BrowserWindow({
    width: 800,
    height: 600,
    show: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    window.loadURL(process.env["ELECTRON_RENDERER_URL"] + "/#/terminal");
  } else {
    window.loadFile(path.join(__dirname, "../renderer/index.html"), {
      hash: "/terminal",
    });
  }
}