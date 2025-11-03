import { app, globalShortcut } from "electron";
import { MainWindowManager } from "./MainWindow/MainWindow";
import { FloatingWindowManager } from "./FloateWindow";
app.whenReady().then(() => {
  globalShortcut.register("Command+`", () => {
    FloatingWindowManager.toggleFloatingWindowVisible();
  });
  globalShortcut.register("Alt+Space", () => {
    MainWindowManager.toggleIsShowMainWindow();
  });
});
