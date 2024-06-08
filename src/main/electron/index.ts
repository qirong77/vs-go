import { app } from "electron";
import VsGoTray from "./Tray";
import MainWindow from "./MainWindow";
import VsGoGlobalShortCut from "./GlobalShortCut";
import { IpcEventHandler } from "./ipcEventHandler";
import { MainWindowFileManager } from "../helper/MainWindowFileManager";

app.whenReady().then(() => {
  const mainWindow = new MainWindow();
  new VsGoGlobalShortCut(mainWindow);
  new VsGoTray();
  new IpcEventHandler(mainWindow, new MainWindowFileManager());
  mainWindow.show();
});
process.on('uncaughtException', (error) => {
  // 在此处记录错误信息，例如写入日志文件或发送到远程服务器
  console.error('Uncaught Exception:', error);
});