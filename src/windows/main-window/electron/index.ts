import { is } from "@electron-toolkit/utils";
import { BrowserWindow } from "electron";
import path from "node:path";
import { presentWindowOnActiveDisplay } from "@platform/electron/createWindow";
import { configureMacOsLauncherApp } from "@platform/electron/macosWorkspace";
import { vsgoLog } from "@platform/log/logger";
import { MainWindowEvent } from "@windows/main-window/events";
import { setupContextMenu } from "@platform/electron/contextMenu";
import {
  getMainWindowFilesCache,
  refreshMainWindowFilesCache,
} from "./fileManager";

let _mainWindow: BrowserWindow;

export function initMainWindow(): void {
  _mainWindow = createMainWindow();
  void refreshMainWindowFilesCache();
  vsgoLog("MainWindow", "主搜索窗已创建", {
    detail: { bounds: _mainWindow.getBounds() },
  });
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 700,
    height: 600,
    show: false,
    frame: is.dev,
    title: "VsGo",
    autoHideMenuBar: !is.dev,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    window.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}#/main-window`);
  } else {
    window.loadFile(path.join(__dirname, "../renderer/index.html"), { hash: "/main-window" });
  }

  window.setAlwaysOnTop(true, "screen-saver", 1);
  configureMacOsLauncherApp();

  window.on("show", () => {
    vsgoLog("MainWindow", "show 事件");
    notifyMainWindowShown(window);
  });

  window.on("hide", () => {
    vsgoLog("MainWindow", "hide 事件", {
      detail: windowState(window),
    });
  });

  window.on("blur", () => {
    vsgoLog("MainWindow", "blur 事件", {
      detail: windowState(window),
    });
  });

  window.on("focus", () => {
    vsgoLog("MainWindow", "focus 事件", {
      detail: windowState(window),
    });
  });

  setupContextMenu(window);

  window.webContents.once("did-finish-load", () => {
    void refreshMainWindowFilesCache();
  });

  return window;
}

function windowState(window: BrowserWindow): Record<string, unknown> {
  return {
    isVisible: window.isVisible(),
    isFocused: window.isFocused(),
    bounds: window.getBounds(),
  };
}

function notifyMainWindowShown(window: BrowserWindow): void {
  if (window.isDestroyed() || window.webContents.isDestroyed()) return;
  const cached = getMainWindowFilesCache();
  window.webContents.send(MainWindowEvent.MAIN_WINDOW_SHOW, cached ?? []);
  void refreshMainWindowFilesCache();
  vsgoLog("MainWindow", "已发送 MAIN_WINDOW_SHOW", {
    detail: { cachedCount: cached?.length ?? 0 },
  });
}

function ensureMainWindow(): BrowserWindow {
  if (!_mainWindow || _mainWindow.isDestroyed()) {
    vsgoLog("MainWindow", "主窗不存在或已销毁，重新创建");
    _mainWindow = createMainWindow();
  }
  return _mainWindow;
}

function presentAtCursor(): void {
  void refreshMainWindowFilesCache();
  const window = ensureMainWindow();
  const state = windowState(window);

  if (window.isVisible() && window.isFocused()) {
    vsgoLog("MainWindow", "presentAtCursor → hide（已聚焦）", { detail: state });
    window.hide();
    return;
  }

  vsgoLog("MainWindow", "presentAtCursor → 唤起", { detail: state });
  presentWindowOnActiveDisplay(window);
  notifyMainWindowShown(window);
  vsgoLog("MainWindow", "presentAtCursor 完成", {
    detail: windowState(window),
  });
}

function setWindowSize(w: number, h: number): void {
  _mainWindow.setSize(w, h);
}

function hide(): void {
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    vsgoLog("MainWindow", "hide() 调用", { detail: windowState(_mainWindow) });
    _mainWindow.hide();
  }
}

function getMainWindow(): BrowserWindow {
  return _mainWindow;
}

export const MainWindowManager = {
  presentAtCursor,
  getMainWindow,
  hide,
  setWindowSize,
};
