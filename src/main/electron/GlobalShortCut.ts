import { app, globalShortcut } from "electron";
import { MainWindowManager } from "./MainWindow/MainWindow";
import { TabbedBrowserWindowManager } from "./BrowserWindow/TabbedBrowserWindowManager";
import { toggleUserNotesWindow } from "./UserNotesWindow/UserNotesWindow";

app.whenReady().then(() => {
  globalShortcut.register("Command+`", () => {
    TabbedBrowserWindowManager.toggleVisible();
  });

  globalShortcut.register("Alt+Space", () => {
    MainWindowManager.toggleIsShowMainWindow();
  });
  globalShortcut.register("Alt+Space+N", () => {
    MainWindowManager.hide();
    toggleUserNotesWindow();
  });
});
