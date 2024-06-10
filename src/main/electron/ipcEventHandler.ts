import { MainWindowFileManager } from "./../helper/MainWindowFileManager";
import { VS_GO_EVENT } from "./../../common/EVENT";
import { ipcMain } from "electron";
import MainWindow from "./MainWindow";
import { openFileByVscode } from "../utils/openFileByVsCode";
import { is } from "@electron-toolkit/utils";
import { IMainWindowFile } from "../../common/type";
import { execSync } from "child_process";

export class IpcEventHandler {
  mainWindow: MainWindow;
  mainWindowFileManager: MainWindowFileManager;
  openedFileTimes = {};
  constructor(mainWindow: MainWindow, mainWindowFileManager: MainWindowFileManager) {
    this.mainWindow = mainWindow;
    this.mainWindowFileManager = mainWindowFileManager;
    ipcMain.handle(VS_GO_EVENT.GET_FILES_LIST, () => {
      return mainWindowFileManager.mainWindowFiles;
    });
    ipcMain.handle(VS_GO_EVENT.GET_OPEN_FILES_TIMES, () => {
      return this.openedFileTimes;
    });
    ipcMain.handle(VS_GO_EVENT.GET_VSCODE_WINDOW_FIELS, () => {
      return new Promise((resolve) => {
        resolve([mainWindowFileManager.vscodeWindowFiles, this.openedFileTimes]);
      });
    });
    ipcMain.on(VS_GO_EVENT.SET_SEARCH_WINDOW_HEIGHT, (_e, arg) => {
      !is.dev && mainWindow.window.setSize(650, Math.floor(arg));
    });
    ipcMain.on(VS_GO_EVENT.OPEN_FILE, (_e, file: IMainWindowFile) => {
      mainWindow.window.hide();
      const filePath = file.filePath;
      if (file.useAppBase64) {
        this.openedFileTimes[filePath] = (this.openedFileTimes[filePath] || 0) + 1;
        openFileByVscode(filePath);
      } else {
        const command = `open ${file.filePath}`;
        execSync(command);
      }
      // 延迟执行,否则会卡顿,因为执行code -s需要大概1s
      setTimeout(() => {
        this.mainWindowFileManager.updateVsCodeWindowFiles(true);
      });
    });
  }
}
