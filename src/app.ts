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
import { registerGcHandlers } from "@windows/gc/ipc";
import { startGcRunner, stopGcRunner } from "@windows/gc/runner";
import { startWorkspaceAppChecker } from "@windows/app-setting/workspace-app";
import {
  startChromeSyncServer,
  loadSnapshotAndApply,
} from "@windows/browser/electron/chrome-sync-server";
import {
  startRemoteBrowserServer,
  stopRemoteBrowserServer,
} from "@windows/browser/electron/remote-browser-server";

configureMacOsLauncherApp();

app.setLoginItemSettings({ openAtLogin: true });

app.whenReady().then(async () => {
  registerFileHandlers();
  registerBrowserHandlers();
  registerTabbedBrowserHandlers();
  registerCookieHandlers();
  registerSettingsHandlers();
  registerWindowScriptHandlers();
  registerLogHandlers();
  registerGcHandlers();

  startChromeSyncServer();
  void loadSnapshotAndApply();
  startRemoteBrowserServer();

  registerGlobalShortcuts();
  initTray();
  initMainWindow();
  startGcRunner();

  startWorkspaceAppChecker();
});

process.on("uncaughtException", (error) => {
  dialog.showErrorBox("Error", error.message);
});

app.once("before-quit", () => {
  stopGcRunner();
  void stopRemoteBrowserServer();
});
