import { globalShortcut } from "electron";
import { toogleDevTools, toogleIsShowMainWindow } from "./MainWindow/MainWindow";
globalShortcut.register("Alt+Space", () => {
  toogleIsShowMainWindow();
});
globalShortcut.register("F12", () => {
  toogleDevTools();
});
