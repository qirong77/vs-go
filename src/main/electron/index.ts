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
