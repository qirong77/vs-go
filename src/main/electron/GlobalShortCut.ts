import { app, globalShortcut } from "electron";
import { MainWindowManager } from "./MainWindow/MainWindow";
import { FloatingWindowManager } from "./FloatingWindow";

app.whenReady().then(() => {
  globalShortcut.register("Command+`", () => {
    FloatingWindowManager.toggleVisible();
  });

  globalShortcut.register("Alt+Space", () => {
    MainWindowManager.toggleIsShowMainWindow();
  });
});
