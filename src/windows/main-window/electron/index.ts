import { is } from "@electron-toolkit/utils";
import { app, BrowserWindow } from "electron";
import path from "node:path";
import { presentWindowOnActiveDisplay } from "@platform/electron/createWindow";
import { vsgoLog } from "@platform/log/logger";
import { MainWindowEvent } from "@windows/main-window/events";
import { setupContextMenu } from "@platform/electron/contextMenu";

let _mainWindow: BrowserWindow;

app.once("ready", () => {
  _mainWindow = createMainWindow();
  vsgoLog("MainWindow", "主搜索窗已创建", {
    detail: { bounds: _mainWindow.getBounds() },
  });
});

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 700,
    height: 600,
    show: true,
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

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.setAlwaysOnTop(true, "torn-off-menu", 10);

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
  window.webContents.send(MainWindowEvent.MAIN_WINDOW_SHOW);
  vsgoLog("MainWindow", "已发送 MAIN_WINDOW_SHOW");
}

function ensureMainWindow(): BrowserWindow {
  if (!_mainWindow || _mainWindow.isDestroyed()) {
    vsgoLog("MainWindow", "主窗不存在或已销毁，重新创建");
    _mainWindow = createMainWindow();
  }
  return _mainWindow;
}

/** Alt+Space：在光标所在屏幕唤起；仅当搜索窗已聚焦时再次按下才隐藏 */
function presentAtCursor(): void {
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
