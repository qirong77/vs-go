import { MainWindowFileManager } from './../helper/MainWindowFileManager';
import { VS_GO_EVENT } from "./../../common/EVENT";
import { ipcMain } from "electron";
import MainWindow from "./MainWindow";
import { openFileByVscode } from '../utils/openFileByVsCode';
import { is } from '@electron-toolkit/utils'

export class IpcEventHandler {
  mainWindow:MainWindow;
  mainWindowFileManager:MainWindowFileManager
  openedFileTimes = {} 
  constructor(mainWindow: MainWindow,mainWindowFileManager: MainWindowFileManager) {
    this.mainWindow = mainWindow;
    this.mainWindowFileManager = mainWindowFileManager
    ipcMain.handle(VS_GO_EVENT.GET_FILES_LIST, () => {
      return mainWindowFileManager.mainWindowFiles
    });
    ipcMain.handle(VS_GO_EVENT.GET_OPEN_FILES_TIMES,()=>{
      return this.openedFileTimes
    })
    ipcMain.handle(VS_GO_EVENT.GET_VSCODE_WINDOW_FIELS,() => {
      return new Promise((resolve)=>{
        resolve([mainWindowFileManager.vscodeWindowFiles,this.openedFileTimes])
      })
    });
    ipcMain.on(VS_GO_EVENT.SET_SEARCH_WINDOW_HEIGHT,(e,arg)=>{
      !is.dev && mainWindow.window.setSize(650, Math.floor(arg));
    })
    ipcMain.on(VS_GO_EVENT.OPEN_FILE,(e,filePath)=>{
      mainWindow.window.hide();
      this.openedFileTimes[filePath] = (this.openedFileTimes[filePath] || 0) + 1;
      openFileByVscode(filePath)
      this.mainWindowFileManager.updateVsCodeWindowFiles(true)
    })
  }
}
