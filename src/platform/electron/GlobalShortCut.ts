import { app, globalShortcut, powerMonitor } from "electron";
import { vsgoLog } from "@platform/log/logger";
import { MainWindowManager } from "@windows/main-window/electron";
import { TabbedBrowserWindowManager } from "@windows/browser/electron/TabbedBrowserWindowManager";

const SHORTCUT_BROWSER = "Command+`";
const SHORTCUT_SEARCH = "Alt+Space";

function registerGlobalShortcuts(): void {
  globalShortcut.unregisterAll();

  const browserOk = globalShortcut.register(SHORTCUT_BROWSER, () => {
    vsgoLog("GlobalShortcut", `${SHORTCUT_BROWSER} 触发`);
    MainWindowManager.hide();
    TabbedBrowserWindowManager.toggleVisible();
    TabbedBrowserWindowManager.blurAllAddressBars();
  });

  const searchOk = globalShortcut.register(SHORTCUT_SEARCH, () => {
    vsgoLog("GlobalShortcut", `${SHORTCUT_SEARCH} 触发`);
    // 先唤起搜索窗；下一 tick 再 hide 浏览器，避免激活应用时先跳到其它 Space
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

function ensureGlobalShortcuts(): void {
  const searchRegistered = globalShortcut.isRegistered(SHORTCUT_SEARCH);
  vsgoLog("GlobalShortcut", "检查快捷键注册状态", {
    detail: { searchRegistered },
  });
  if (!searchRegistered) {
    registerGlobalShortcuts();
  }
}

app.whenReady().then(() => {
  vsgoLog("App", "应用就绪，注册全局快捷键");
  registerGlobalShortcuts();
});

app.on("activate", () => {
  vsgoLog("App", "activate 事件，确保快捷键已注册");
  ensureGlobalShortcuts();
});

powerMonitor.on("resume", () => {
  vsgoLog("App", "系统唤醒，确保快捷键已注册");
  ensureGlobalShortcuts();
});
