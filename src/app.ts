import { app, dialog } from "electron";
import { configureMacOsLauncherApp } from "@platform/electron/macosWorkspace";

configureMacOsLauncherApp();

import "@windows/browser/electron/tabbed-browser-ipc";
import "@platform/electron/GlobalShortCut";
import "@windows/main-window/electron";
import "@platform/electron/registerIpc";

app.whenReady().then(async () => {
  await import("./tray");
  await import("./setupWorkSpaceApp");
});

process.on("uncaughtException", (error) => {
  dialog.showErrorBox("Error", error.message);
});
