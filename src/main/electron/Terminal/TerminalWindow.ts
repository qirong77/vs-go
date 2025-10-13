import { is } from "@electron-toolkit/utils";
import { BrowserWindow, ipcMain } from "electron";
import path from "path";
import { VS_GO_EVENT } from "../../../common/EVENT";
import { createTerminal } from "./Terminal";

export function createTerminalWindow() {
  const window = new BrowserWindow({
    width: 1000,
    height: 700,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    window.loadURL(process.env["ELECTRON_RENDERER_URL"] + "/#/terminal");
  } else {
    window.loadFile(path.join(__dirname, "../renderer/index.html"), {
      hash: "/terminal",
    });
  }

  ipcMain.on(VS_GO_EVENT.TERMINAL_RUN_COMMAND, (event, command: string) => {
    const terminal = createTerminal({
      sendTerminalMessage(data) {
        console.log('sendTerminalMessage', data);
        window.webContents.send(VS_GO_EVENT.TERMINAL_SEND_DATA, data);
      },
    });
    terminal.runCommand(command);
  });
  return window;
}
