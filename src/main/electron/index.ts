import { app, dialog } from "electron";
app.whenReady().then(async () => {
  // 设置开机自启动
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true
  });
  import("./MainWindow/MainWindow");
  import('./GlobalShortCut')
  import('./ipcEventHandler')
  import('./Tray')
});
process.on("uncaughtException", (error) => {
  dialog.showErrorBox("Error", error.message);
});
