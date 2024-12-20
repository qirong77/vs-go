import { VS_GO_EVENT } from "./../../common/EVENT";
import { dialog, ipcMain } from "electron";
import { openFileByVscode } from "../utils/openFileByVsCode";
import { is } from "@electron-toolkit/utils";
import { IMainWindowFile } from "../../common/type";
import { execSync } from "child_process";
import { hide, setWindowSize } from "./MainWindow/MainWindow";
import { getMainWindowFiles, getVsCodeOpenedFiles, updateMainWindowFiles } from "./MainWindow/MainWindowFileManager";
import { existsSync } from "fs";
const openedFileTimes: { [key: string]: number } = {};
ipcMain.on(VS_GO_EVENT.SET_SEARCH_WINDOW_HEIGHT, (_e, arg) => {
  !is.dev && setWindowSize(650, Math.floor(arg));
});
ipcMain.on(VS_GO_EVENT.OPEN_FILE, (_e, file: IMainWindowFile) => {
  hide();
  const filePath = file.filePath;
  if(!existsSync(filePath)) {
    dialog.showErrorBox('文件不存在',`${filePath} 不存在`)
    return
  }
  if (file.useAppBase64) {
    openedFileTimes[filePath] = (openedFileTimes[filePath] || 0) + 1;
    openFileByVscode(filePath);
  } else {
    const command = `open ${file.filePath}`;
    execSync(command);
  }
});
ipcMain.handle(VS_GO_EVENT.GET_FILES_LIST, async () => {
  await updateMainWindowFiles()
  return getMainWindowFiles();
});

ipcMain.handle(VS_GO_EVENT.GET_OPEN_FILES_TIMES, () => {
  return openedFileTimes;
});
ipcMain.handle(VS_GO_EVENT.GET_VSCODE_WINDOW_FIELS, () => {
  return new Promise((resolve) => {
    resolve([getVsCodeOpenedFiles(), openedFileTimes]);
  });
});
