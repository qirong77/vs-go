import { dialog, ipcMain } from "electron";
import { existsSync } from "node:fs";
import { exec } from "node:child_process";
import { is } from "@electron-toolkit/utils";
import { MainWindowEvent } from "@windows/main-window/events";
import type { IMainWindowFile } from "@shared/type";
import { vscodeBase64 } from "@shared/vscodeBase64";
import { openFileByVscode } from "@utils/openFileByVsCode";
import { openFileByCursor } from "@utils/openFileByCursor";
import { getMainWindowFiles } from "./electron/fileManager";
import { vsgoStore, fileAccessStore } from "./store";
import { MainWindowManager } from "./electron";
import type { AppSettings } from "@shared/type";

export function registerFileHandlers(): void {
  ipcMain.on(MainWindowEvent.SET_SEARCH_WINDOW_HEIGHT, (_e, height: number) => {
    if (!is.dev) {
      MainWindowManager.setWindowSize(700, Math.floor(height));
    }
  });

  ipcMain.on(MainWindowEvent.OPEN_FILE, (_e, file: IMainWindowFile) => {
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

  ipcMain.handle(MainWindowEvent.GET_FILES_LIST, async () => {
    return getMainWindowFiles();
  });
}
