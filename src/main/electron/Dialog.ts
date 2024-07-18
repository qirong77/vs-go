import { dialog } from "electron";
import { getMainWindow } from "./MainWindow/MainWindow";

export function showErrorDialog(msg = "") {
  dialog.showMessageBox(getMainWindow(), {
    title: "错误",
    message: msg,
    type: "error",
  });
}
