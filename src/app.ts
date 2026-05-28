import { app, dialog } from "electron";
import { configureMacOsLauncherApp } from "@platform/electron/macosWorkspace";
import { registerGlobalShortcuts } from "@platform/electron/GlobalShortCut";
import { initMainWindow } from "@windows/main-window/electron";
import { initTray } from "./tray";
import { registerFileHandlers } from "@windows/main-window/ipc";
import { registerBrowserHandlers } from "@windows/browser/ipc";
import { registerTabbedBrowserHandlers } from "@windows/browser/electron/tabbed-browser-ipc";
import { registerCookieHandlers } from "@windows/cookie-manager/ipc";
import { registerSettingsHandlers } from "@windows/app-setting/ipc";
import { registerWindowScriptHandlers } from "@windows/script-editor/ipc";
import { registerLogHandlers } from "@platform/log/ipc";
import { startWorkspaceAppChecker } from "@windows/app-setting/workspace-app";

configureMacOsLauncherApp();

app.whenReady().then(async () => {
  registerFileHandlers();
  registerBrowserHandlers();
  registerTabbedBrowserHandlers();
  registerCookieHandlers();
  registerSettingsHandlers();
  registerWindowScriptHandlers();
  registerLogHandlers();

  registerGlobalShortcuts();
  initTray();
  initMainWindow();

  startWorkspaceAppChecker();
});

process.on("uncaughtException", (error) => {
  dialog.showErrorBox("Error", error.message);
});
