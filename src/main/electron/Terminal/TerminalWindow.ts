import { is } from "@electron-toolkit/utils";
import { BrowserWindow, ipcMain } from "electron";
import path from "path";
import { VS_GO_EVENT } from "../../../common/EVENT";

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
  ipcMain.on(VS_GO_EVENT.TERMINAL_RUN_COMMAND, (_event, command: string) => {
    if (_event.sender === window.webContents) {
      // 在这里处理命令执行逻辑
      console.log("执行命令:", command);
      // 你可以将命令发送到终端窗口进行处理
      window.webContents.send(VS_GO_EVENT.TERMINAL_SEND_DATA, command);
    }
  });
  return window;
}
