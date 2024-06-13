import { VS_GO_EVENT } from "./../../common/EVENT";
import { ipcMain } from "electron";
import { openFileByVscode } from "../utils/openFileByVsCode";
import { is } from "@electron-toolkit/utils";
import { IMainWindowFile } from "../../common/type";
import { execSync } from "child_process";
import { hide, setWindowSize } from "./MainWindow/MainWindow";
import { getMainWindowFiles, getVsCodeOpenedFiles, updateVsCodeOpenedFiles } from "./MainWindow/MainWindowFileManager";
const openedFileTimes: { [key: string]: number } = {};
ipcMain.on(VS_GO_EVENT.SET_SEARCH_WINDOW_HEIGHT, (_e, arg) => {
  !is.dev && setWindowSize(650, Math.floor(arg));
});
ipcMain.on(VS_GO_EVENT.OPEN_FILE, (_e, file: IMainWindowFile) => {
  hide();
  const filePath = file.filePath;
  if (file.useAppBase64) {
    openedFileTimes[filePath] = (openedFileTimes[filePath] || 0) + 1;
    openFileByVscode(filePath);
  } else {
    const command = `open ${file.filePath}`;
    execSync(command);
  }
  // 延迟执行,否则会卡顿,因为执行code -s需要大概1s
  setTimeout(() => {
    updateVsCodeOpenedFiles();
  });
});
ipcMain.handle(VS_GO_EVENT.GET_FILES_LIST, () => {
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
