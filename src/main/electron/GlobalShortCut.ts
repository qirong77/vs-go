import { globalShortcut } from "electron";
import { MainWindowManager } from "./MainWindow/MainWindow";
import { FloatingWindowManager } from "./FloateWindow";
globalShortcut.register("Command+Escape", () => {
  FloatingWindowManager.toggleFloatingWindowVisible();
});
globalShortcut.register("Alt+Space", () => {
  MainWindowManager.toggleIsShowMainWindow();
});
