import { app, dialog } from "electron";
import VsGoTray from "./Tray";
import MainWindow from "./MainWindow";
import VsGoGlobalShortCut from "./GlobalShortCut";
import { IpcEventHandler } from "./ipcEventHandler";
import { MainWindowFileManager } from "../helper/MainWindowFileManager";
app.whenReady().then(() => {
  const mainWindow = new MainWindow();
  new VsGoGlobalShortCut(mainWindow);
  new VsGoTray(mainWindow);
  new IpcEventHandler(mainWindow, new MainWindowFileManager());
  mainWindow.show();
});
process.on("uncaughtException", (error) => {
  dialog.showErrorBox("Error", error.message);
});
