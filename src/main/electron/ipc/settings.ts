import { ipcMain, shell } from "electron";
import { VS_GO_EVENT } from "../../../common/EVENT";
import type { AppSettings } from "../../../common/type";
import { formatError } from "../../../common/utils";
import { vsgoStore } from "../store";

const DEFAULT_SETTINGS: AppSettings = { defaultEditor: "vscode" };

export function registerSettingsHandlers(): void {
  ipcMain.handle(VS_GO_EVENT.APP_SETTINGS_GET, async () => {
    try {
      return vsgoStore.get("appSettings", DEFAULT_SETTINGS);
    } catch (error) {
      console.error("获取 App 设置失败:", error);
      return DEFAULT_SETTINGS;
    }
  });

  ipcMain.handle(VS_GO_EVENT.APP_SETTINGS_SET, async (_event, settings: AppSettings) => {
    try {
      vsgoStore.set("appSettings", settings);
      return { success: true };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });

  ipcMain.handle(VS_GO_EVENT.OPEN_EXTERNAL_URL, async (_event, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });
}
