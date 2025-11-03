import { app, dialog } from "electron";
import { MainWindowManager } from "./MainWindow/MainWindow";
import { createTerminalWindow } from "./Terminal/TerminalWindow";

app.whenReady().then(async () => {
  // 设置开机自启动
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true,
  });
  import("./MainWindow/MainWindow").then(() => {
    MainWindowManager.toggleIsShowMainWindow();
  });
  import("./GlobalShortCut");
  import("./ipcEventHandler");
  import("./Tray");
  // createTerminalWindow();
});
process.on("uncaughtException", (error) => {
  dialog.showErrorBox("Error", error.message);
});
