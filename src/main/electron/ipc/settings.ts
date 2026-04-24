import { ipcMain, shell } from "electron";
import { VS_GO_EVENT } from "../../../common/EVENT";
import type { AppSettings } from "../../../common/type";
import { formatError } from "../../../common/utils";
import { TabbedBrowserWindowManager } from "../BrowserWindow/TabbedBrowserWindowManager";
import { vsgoStore } from "../store";

/** 在应用内 TabbedBrowserWindow 新标签中打开（笔记内链接等），其余走系统默认程序 */
async function openUrlInTabbedBrowserOrExternal(url: string): Promise<void> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "vsgo:") {
      TabbedBrowserWindowManager.openUrl(url);
      return;
    }
  } catch {
    // 非合法 URL 时交给 openExternal 尝试
  }
  await shell.openExternal(url);
}

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
      await openUrlInTabbedBrowserOrExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });
}
