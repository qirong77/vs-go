import { app, dialog } from "electron";
import { MainWindowManager } from "./MainWindow/MainWindow";


export function showErrorDialog(msg = "") {
  if(app.isReady()) {
    dialog.showMessageBox(MainWindowManager.getMainWindow(), {
      title: "错误",
      message: msg,
      type: "error",
    });
    return
  }
  app.whenReady().then(()=>{
    dialog.showMessageBox(MainWindowManager.getMainWindow(), {
      title: "错误",
      message: msg,
      type: "error",
    });
  })
}
