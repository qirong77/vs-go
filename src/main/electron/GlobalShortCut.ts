import { app, globalShortcut } from "electron";
import { MainWindowManager } from "./MainWindow/MainWindow";
import { FloatingWindowManager } from "./FloatingWindow";
import { toggleUserNotesWindow } from "./UserNotesWindow/UserNotesWindow";

app.whenReady().then(() => {
  globalShortcut.register("Command+`", () => {
    FloatingWindowManager.toggleVisible();
  });

  globalShortcut.register("Alt+Space", () => {
    MainWindowManager.toggleIsShowMainWindow();
  });
  globalShortcut.register("Alt+Space+N", () => {
    MainWindowManager.hide();
    toggleUserNotesWindow();
  });
});
