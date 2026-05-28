import { app, globalShortcut, powerMonitor } from "electron";
import { vsgoLog } from "@platform/log/logger";
import { MainWindowManager } from "@windows/main-window/electron";
import { TabbedBrowserWindowManager } from "@windows/browser/electron/TabbedBrowserWindowManager";

const SHORTCUT_BROWSER = "Command+`";
const SHORTCUT_SEARCH = "Alt+Space";

function register(): void {
  globalShortcut.unregisterAll();

  const browserOk = globalShortcut.register(SHORTCUT_BROWSER, () => {
    vsgoLog("GlobalShortcut", `${SHORTCUT_BROWSER} 触发`);
    MainWindowManager.hide();
    TabbedBrowserWindowManager.toggleVisible();
    TabbedBrowserWindowManager.blurAllAddressBars();
  });

  const searchOk = globalShortcut.register(SHORTCUT_SEARCH, () => {
    vsgoLog("GlobalShortcut", `${SHORTCUT_SEARCH} 触发`);
    MainWindowManager.presentAtCursor();
    setImmediate(() => TabbedBrowserWindowManager.hideAll());
  });

  vsgoLog("GlobalShortcut", "注册全局快捷键", {
    detail: {
      [SHORTCUT_BROWSER]: browserOk,
      [SHORTCUT_SEARCH]: searchOk,
      browserRegistered: globalShortcut.isRegistered(SHORTCUT_BROWSER),
      searchRegistered: globalShortcut.isRegistered(SHORTCUT_SEARCH),
    },
    level: browserOk && searchOk ? "info" : "warn",
  });
}

function ensure(): void {
  const searchRegistered = globalShortcut.isRegistered(SHORTCUT_SEARCH);
  vsgoLog("GlobalShortcut", "检查快捷键注册状态", {
    detail: { searchRegistered },
  });
  if (!searchRegistered) {
    register();
  }
}

export function registerGlobalShortcuts(): void {
  app.whenReady().then(() => {
    vsgoLog("App", "应用就绪，注册全局快捷键");
    register();
  });

  app.on("activate", () => {
    vsgoLog("App", "activate 事件，确保快捷键已注册");
    ensure();
  });

  powerMonitor.on("resume", () => {
    vsgoLog("App", "系统唤醒，确保快捷键已注册");
    ensure();
  });
}
