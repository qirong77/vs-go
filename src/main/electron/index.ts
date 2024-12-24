import { app, dialog } from "electron";
app.whenReady().then(async () => {
  import("./MainWindow/MainWindow");
  import('./GlobalShortCut')
  import('./ipcEventHandler')
  import('./Tray')
});
process.on("uncaughtException", (error) => {
  dialog.showErrorBox("Error", error.message);
});
