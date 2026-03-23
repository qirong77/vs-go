import { dialog, ipcMain } from "electron";
import { existsSync } from "node:fs";
import { exec } from "node:child_process";
import { is } from "@electron-toolkit/utils";
import { VS_GO_EVENT } from "../../../common/EVENT";
import type { IMainWindowFile } from "../../../common/type";
import { vscodeBase64 } from "../../../common/vscodeBase64";
import { openFileByVscode } from "../../utils/openFileByVsCode";
import { openFileByCursor } from "../../utils/openFileByCursor";
import { getMainWindowFiles } from "../MainWindow/MainWindowFileManager";
import { vsgoStore, fileAccessStore } from "../store";
import { MainWindowManager } from "../MainWindow/MainWindow";
import type { AppSettings } from "../../../common/type";

export function registerFileHandlers(): void {
  ipcMain.on(VS_GO_EVENT.SET_SEARCH_WINDOW_HEIGHT, (_e, height: number) => {
    if (!is.dev) {
      MainWindowManager.setWindowSize(700, Math.floor(height));
    }
  });

  ipcMain.on(VS_GO_EVENT.OPEN_FILE, (_e, file: IMainWindowFile) => {
    const { filePath } = file;

    if (!existsSync(filePath)) {
      dialog.showErrorBox("文件不存在", `${filePath} 不存在`);
      return;
    }

    fileAccessStore.updateAccessTime(filePath);

    if (filePath.includes("Applications")) {
      exec(`open "${filePath}"`, (error) => {
        if (error) dialog.showErrorBox("打开应用失败", error.message);
      });
      MainWindowManager.hide();
      return;
    }

    if (file.useAppBase64 === vscodeBase64) {
      MainWindowManager.hide();
      const appSettings = vsgoStore.get("appSettings", { defaultEditor: "vscode" }) as AppSettings;
      if (appSettings.defaultEditor === "cursor") {
        openFileByCursor(filePath);
      } else {
        openFileByVscode(filePath);
      }
      return;
    }

    exec(`open -R "${filePath}"`, (error) => {
      if (error) dialog.showErrorBox("打开文件失败", error.message);
    });
    MainWindowManager.hide();
  });

  ipcMain.handle(VS_GO_EVENT.GET_FILES_LIST, async () => {
    return getMainWindowFiles();
  });
}
