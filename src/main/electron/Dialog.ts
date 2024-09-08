import { app, dialog } from "electron";
import { getMainWindow } from "./MainWindow/MainWindow";

export function showErrorDialog(msg = "") {
  if(app.isReady()) {
    dialog.showMessageBox(getMainWindow(), {
      title: "错误",
      message: msg,
      type: "error",
    });
    return
  }
  app.whenReady().then(()=>{
    dialog.showMessageBox(getMainWindow(), {
      title: "错误",
      message: msg,
      type: "error",
    });
  })
}
