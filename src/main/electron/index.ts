import { app, dialog } from "electron";
import "./BrowserWindow/ipc";
import "./GlobalShortCut";
import "./MainWindow/MainWindow";
import "./ipcEventHandler";

app.whenReady().then(async () => {
  import("./Tray");
});

process.on("uncaughtException", (error) => {
  dialog.showErrorBox("Error", error.message);
});
