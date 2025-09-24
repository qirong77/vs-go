import { globalShortcut } from "electron";
import { MainWindowManager } from "./MainWindow/MainWindow";
import { FloatingWindowManager } from "./FloateWindow";
globalShortcut.register("Alt+Space+Shift", () => {
  FloatingWindowManager.toogleFloatingWindowVisible();
});
globalShortcut.register("Alt+Space", () => {
  MainWindowManager.toogleIsShowMainWindow();
});
globalShortcut.register("F12", () => {
  MainWindowManager.toogleDevTools();
});
