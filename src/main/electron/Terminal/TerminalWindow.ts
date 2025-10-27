import { is } from "@electron-toolkit/utils";
import { BrowserWindow, ipcMain } from "electron";
import path from "path";
import { VS_GO_EVENT } from "../../../common/EVENT";
import { createTerminal } from "./Terminal";

export function createTerminalWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: true,
    titleBarStyle: "default",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    window.loadURL(process.env["ELECTRON_RENDERER_URL"] + "/#/terminal");
  } else {
    window.loadFile(path.join(__dirname, "../renderer/index.html"), {
      hash: "/terminal",
    });
  }

  // 创建终端实例，每个窗口一个终端会话
  const terminal = createTerminal({
    sendTerminalMessage(data) {
      // 只发送给当前窗口
      if (!window.isDestroyed()) {
        window.webContents.send(VS_GO_EVENT.TERMINAL_SEND_DATA, data);
      }
    },
  });

  // 处理终端命令
  const handleTerminalCommand = (event: Electron.IpcMainEvent, command: string) => {
    // 只处理来自当前窗口的命令
    if (event.sender === window.webContents) {
      terminal.runCommand(command);
    }
  };

  // 处理终端中断
  const handleTerminalInterrupt = (event: Electron.IpcMainEvent) => {
    if (event.sender === window.webContents) {
      const killed = terminal.killCurrentProcess();
      window.webContents.send(VS_GO_EVENT.TERMINAL_SEND_DATA, {
        type: killed ? "info" : "error",
        content: killed ? "Process interrupted\n" : "No process to interrupt\n",
      });
    }
  };

  // 获取当前工作目录
  const handleGetCurrentDirectory = (event: Electron.IpcMainEvent) => {
    if (event.sender === window.webContents) {
      const cwd = terminal.getCurrentDirectory();
      window.webContents.send(VS_GO_EVENT.TERMINAL_SEND_DATA, {
        type: "cwd",
        content: cwd,
      });
    }
  };

  // 注册事件监听器
  ipcMain.on(VS_GO_EVENT.TERMINAL_RUN_COMMAND, handleTerminalCommand);
  ipcMain.on(VS_GO_EVENT.TERMINAL_INTERRUPT, handleTerminalInterrupt);
  ipcMain.on(VS_GO_EVENT.TERMINAL_GET_CWD, handleGetCurrentDirectory);

  // 窗口关闭时清理
  window.on("closed", () => {
    terminal.dispose();
    // 移除事件监听器
    ipcMain.removeListener(VS_GO_EVENT.TERMINAL_RUN_COMMAND, handleTerminalCommand);
    ipcMain.removeListener(VS_GO_EVENT.TERMINAL_INTERRUPT, handleTerminalInterrupt);
    ipcMain.removeListener(VS_GO_EVENT.TERMINAL_GET_CWD, handleGetCurrentDirectory);
  });

  // 发送初始工作目录
  window.webContents.once("dom-ready", () => {
    setTimeout(() => {
      window.webContents.send(VS_GO_EVENT.TERMINAL_SEND_DATA, {
        type: "cwd",
        content: terminal.getCurrentDirectory(),
      });
    }, 500);
  });

  return window;
}
