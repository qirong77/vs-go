import { app, globalShortcut } from "electron";
import { MainWindowManager } from "@windows/main-window/electron";
import { TabbedBrowserWindowManager } from "@windows/browser/electron/TabbedBrowserWindowManager";
import { toggleUserNotesWindow } from "@windows/user-notes/electron";

app.whenReady().then(() => {
  globalShortcut.register("Command+`", () => {
    MainWindowManager.hide();
    TabbedBrowserWindowManager.toggleVisible();
    TabbedBrowserWindowManager.blurAllAddressBars();
  });

  globalShortcut.register("Alt+Space", () => {
    TabbedBrowserWindowManager.hideAll();
    MainWindowManager.toggleIsShowMainWindow();
  });
  globalShortcut.register("Alt+Space+N", () => {
    MainWindowManager.hide();
    toggleUserNotesWindow();
  });
});
