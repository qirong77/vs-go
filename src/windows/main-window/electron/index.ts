import { is } from "@electron-toolkit/utils";
import { app, BrowserWindow } from "electron";
import path from "node:path";
import { presentWindowAtCursor } from "@platform/electron/createWindow";
import { MainWindowEvent } from "@windows/main-window/events";
import { setupContextMenu } from "@platform/electron/contextMenu";

let _mainWindow: BrowserWindow;

app.once("ready", () => {
  _mainWindow = createMainWindow();
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
    notifyMainWindowShown(window);
  });

  setupContextMenu(window);

  return window;
}

function notifyMainWindowShown(window: BrowserWindow): void {
  if (window.isDestroyed() || window.webContents.isDestroyed()) return;
  window.webContents.send(MainWindowEvent.MAIN_WINDOW_SHOW);
}

function ensureMainWindow(): BrowserWindow {
  if (!_mainWindow || _mainWindow.isDestroyed()) {
    _mainWindow = createMainWindow();
  }
  return _mainWindow;
}

/** Alt+Space：在光标所在屏幕唤起；仅当搜索窗已聚焦时再次按下才隐藏 */
function presentAtCursor(): void {
  const window = ensureMainWindow();
  if (window.isVisible() && window.isFocused()) {
    window.hide();
    return;
  }
  presentWindowAtCursor(window);
  notifyMainWindowShown(window);
}

function setWindowSize(w: number, h: number): void {
  _mainWindow.setSize(w, h);
}

function hide(): void {
  if (_mainWindow && !_mainWindow.isDestroyed()) {
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
