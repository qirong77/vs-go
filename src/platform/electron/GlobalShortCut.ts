import { app, globalShortcut, powerMonitor } from "electron";
import { MainWindowManager } from "@windows/main-window/electron";
import { TabbedBrowserWindowManager } from "@windows/browser/electron/TabbedBrowserWindowManager";

const SHORTCUT_BROWSER = "Command+`";
const SHORTCUT_SEARCH = "Alt+Space";

function registerGlobalShortcuts(): void {
  globalShortcut.unregisterAll();

  if (
    !globalShortcut.register(SHORTCUT_BROWSER, () => {
      MainWindowManager.hide();
      TabbedBrowserWindowManager.toggleVisible();
      TabbedBrowserWindowManager.blurAllAddressBars();
    })
  ) {
    console.warn(`[VsGo] Failed to register global shortcut: ${SHORTCUT_BROWSER}`);
  }

  if (
    !globalShortcut.register(SHORTCUT_SEARCH, () => {
      TabbedBrowserWindowManager.hideAll();
      MainWindowManager.presentAtCursor();
    })
  ) {
    console.warn(`[VsGo] Failed to register global shortcut: ${SHORTCUT_SEARCH}`);
  }
}

function ensureGlobalShortcuts(): void {
  if (!globalShortcut.isRegistered(SHORTCUT_SEARCH)) {
    registerGlobalShortcuts();
  }
}

app.whenReady().then(() => {
  registerGlobalShortcuts();
});

app.on("activate", () => {
  ensureGlobalShortcuts();
});

powerMonitor.on("resume", () => {
  ensureGlobalShortcuts();
});
