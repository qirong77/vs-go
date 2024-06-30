import { app, dialog } from "electron";
import { deboucedUpdateVsCodeFiles, updateMainWindowFiles } from "./MainWindow/MainWindowFileManager";
app.whenReady().then(async () => {
  await updateMainWindowFiles()
  import("./MainWindow/MainWindow");
  import('./GlobalShortCut')
  import('./ipcEventHandler')
  import('./Tray')
  deboucedUpdateVsCodeFiles()
});
process.on("uncaughtException", (error) => {
  dialog.showErrorBox("Error", error.message);
});
