import { app, globalShortcut } from "electron";
import { MainWindowManager } from "@windows/main-window/electron";
import { TabbedBrowserWindowManager } from "@windows/browser/electron/TabbedBrowserWindowManager";

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
});
