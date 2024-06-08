import { MainWindowFileManager } from './../helper/MainWindowFileManager';
import { VS_GO_EVENT } from "./../../common/EVENT";
import { ipcMain } from "electron";
import MainWindow from "./MainWindow";

export class IpcEventHandler {
  mainWindow;
  mainWindowFileManager
  constructor(mainWindow: MainWindow,mainWindowFileManager: MainWindowFileManager) {
    this.mainWindow = mainWindow;
    this.mainWindowFileManager = mainWindowFileManager
    ipcMain.handle(VS_GO_EVENT.GET_FILES_LIST, () => {
      return mainWindowFileManager.mainWindowFiles
    });
    ipcMain.handle(VS_GO_EVENT.Test,() => {
      mainWindowFileManager.updateVsCodeWindowFiles()
      return mainWindowFileManager.vscodeWindowFiles
    });
    ipcMain.on(VS_GO_EVENT.SET_SEARCH_WINDOW_HEIGHT,(e,arg)=>{
      mainWindow.window.setSize(850, Math.floor(arg));
    })
  }
}
