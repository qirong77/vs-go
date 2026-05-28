import { dialog, ipcMain, shell } from "electron";
import path from "node:path";
import { AppEvent } from "@windows/app-setting/events";
import type { AppSettings, WorkspaceApp } from "@shared/type";
import { formatError } from "@shared/utils";
import { TabbedBrowserWindowManager } from "@windows/browser/electron/TabbedBrowserWindowManager";
import { appSettingStore } from "./store";
import { DEFAULT_WORKSPACE_APPS, isAppInstalled, isAppRunning, checkAllApps } from "./workspace-app";

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

export function registerSettingsHandlers(): void {
  ipcMain.handle(AppEvent.APP_SETTINGS_GET, async () => {
    try {
      return appSettingStore.getSettings();
    } catch (error) {
      console.error("获取 App 设置失败:", error);
      return { defaultEditor: "vscode" };
    }
  });

  ipcMain.handle(AppEvent.APP_SETTINGS_SET, async (_event, settings: AppSettings) => {
    try {
      appSettingStore.setSettings(settings);
      return { success: true };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });

  ipcMain.handle(AppEvent.OPEN_EXTERNAL_URL, async (_event, url: string) => {
    try {
      await openUrlInTabbedBrowserOrExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });

  ipcMain.handle(AppEvent.WORKSPACE_APPS_GET, async () => {
    try {
      const userApps = appSettingStore.getWorkspaceApps();
      const defaultsWithStatus = DEFAULT_WORKSPACE_APPS.map((app) => {
        const installed = isAppInstalled(app);
        return {
          ...app,
          installed,
          running: installed ? isAppRunning(app) : false,
          isDefault: true,
        };
      });
      const userAppsWithStatus = userApps.map((app) => {
        const installed = isAppInstalled(app);
        return {
          ...app,
          installed,
          running: installed ? isAppRunning(app) : false,
          isDefault: false,
        };
      });
      return { defaults: defaultsWithStatus, user: userAppsWithStatus };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });

  ipcMain.handle(AppEvent.WORKSPACE_APPS_ADD, async (_event, app: WorkspaceApp) => {
    try {
      const userApps = appSettingStore.getWorkspaceApps();
      const exists = userApps.some((a) => a.bundleName === app.bundleName);
      if (exists) {
        return { success: false, error: "该应用已存在" };
      }
      userApps.push(app);
      appSettingStore.setWorkspaceApps(userApps);
      return { success: true };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });

  ipcMain.handle(AppEvent.WORKSPACE_APPS_REMOVE, async (_event, bundleName: string) => {
    try {
      const userApps = appSettingStore.getWorkspaceApps();
      appSettingStore.setWorkspaceApps(userApps.filter((a) => a.bundleName !== bundleName));
      return { success: true };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });

  ipcMain.handle(AppEvent.WORKSPACE_APP_CHECK_STATUS, async (_event, bundleName: string) => {
    try {
      const installed = isAppInstalled({ displayName: "", bundleName });
      return { installed };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });

  ipcMain.handle(AppEvent.WORKSPACE_APP_SELECT, async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: "选择应用程序",
        defaultPath: "/Applications",
        properties: ["openFile"],
        filters: [{ name: "应用程序", extensions: ["app"] }],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }
      const appPath = result.filePaths[0];
      const base = path.basename(appPath, ".app");
      return { displayName: base, bundleName: base, appPath };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });

  ipcMain.handle(AppEvent.WORKSPACE_APPS_CHECK_NOW, async () => {
    try {
      checkAllApps();
      return { success: true };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });
}
