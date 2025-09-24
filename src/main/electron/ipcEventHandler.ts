import { VS_GO_EVENT } from "./../../common/EVENT";
import { dialog, ipcMain } from "electron";
import { openFileByVscode } from "../utils/openFileByVsCode";
import { is } from "@electron-toolkit/utils";
import { IMainWindowFile } from "../../common/type";
import { execSync } from "child_process";
import { getMainWindowFiles } from "./MainWindow/MainWindowFileManager";
import { existsSync } from "fs";
import { vscodeBase64 } from "../../common/vscodeBase64";
import { BrowserItem, vsgoStore } from "./store";
import { FloatingWindowManager } from "./FloateWindow";
import { MainWindowManager } from "./MainWindow/MainWindow";

ipcMain.on(VS_GO_EVENT.SET_SEARCH_WINDOW_HEIGHT, (_e, arg) => {
  !is.dev && MainWindowManager.setWindowSize(650, Math.floor(arg));
});
ipcMain.on(VS_GO_EVENT.OPEN_FILE, (_e, file: IMainWindowFile) => {
  MainWindowManager.hide();
  const filePath = file.filePath;
  if (!existsSync(filePath)) {
    dialog.showErrorBox("文件不存在", `${filePath} 不存在`);
    return;
  }
  // const isApp = file.filePath.includes('Applications')
  const isOpenFileByVsCode = file.useAppBase64 === vscodeBase64;
  if (isOpenFileByVsCode) {
    openFileByVscode(filePath);
    return;
  }
  const command = `open -R ${file.filePath}`;
  execSync(command);
  return;
});
ipcMain.handle(VS_GO_EVENT.GET_FILES_LIST, async () => {
  const res = await getMainWindowFiles();
  return res;
});

ipcMain.handle(VS_GO_EVENT.BROWSER_LIST, async (event) => {
  const browserList = vsgoStore.get("browserList", []) as BrowserItem[];
  return browserList;
});
ipcMain.handle(VS_GO_EVENT.BROWSER_ADD, async (event, arg) => {
  const browserList = vsgoStore.get("browserList", []) as BrowserItem[];
  browserList.push(arg);
  vsgoStore.set("browserList", browserList);
  return browserList;
});
ipcMain.handle(VS_GO_EVENT.BROWSER_REMOVE, async (event, id) => {
  const browserList = vsgoStore.get("browserList", []) as BrowserItem[];
  const index = browserList.findIndex((item) => item.id == id);
  console.log(index);
  if (index !== -1) {
    browserList.splice(index, 1);
    vsgoStore.set("browserList", browserList);
  }
  return browserList;
});
ipcMain.handle(VS_GO_EVENT.BROWSER_REMOVE_ALL, async (event) => {
  vsgoStore.set("browserList", []);
  return [];
});
ipcMain.handle(VS_GO_EVENT.BROWSER_UPDATE, async (event, arg) => {
  const browserList = vsgoStore.get("browserList", []) as BrowserItem[];
  const index = browserList.findIndex((item) => item.id == arg.id);
  if (index !== -1) {
    browserList[index] = arg;
    vsgoStore.set("browserList", browserList);
  }
  return browserList;
});

ipcMain.on(VS_GO_EVENT.CREATE_FLOATING_WINDOW, (e, arg: BrowserItem) => {
  FloatingWindowManager.createFloatingWindow(arg.url);
  MainWindowManager.hide();
});
