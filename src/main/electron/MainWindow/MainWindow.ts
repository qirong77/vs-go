import { is } from "@electron-toolkit/utils";
import { app, BrowserWindow } from "electron";
import path from "node:path";
import { VS_GO_EVENT } from "../../../common/EVENT";
import { setupContextMenu } from "../contextMenu";

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
    window.webContents.send(VS_GO_EVENT.MAIN_WINDOW_SHOW);
  });

  setupContextMenu(window);

  return window;
}

function showOnCurrentDesktop(): void {
  _mainWindow.center();
  _mainWindow.show();
  _mainWindow.focus();
}

function toggleIsShowMainWindow(): void {
  if (!_mainWindow || _mainWindow.isDestroyed()) {
    _mainWindow = createMainWindow();
    showOnCurrentDesktop();
    return;
  }

  if (_mainWindow.isVisible()) {
    _mainWindow.hide();
  } else {
    showOnCurrentDesktop();
  }
}

function setWindowSize(w: number, h: number): void {
  _mainWindow.setSize(w, h);
}

function hide(): void {
  _mainWindow.hide();
}

function getMainWindow(): BrowserWindow {
  return _mainWindow;
}

export const MainWindowManager = {
  toggleIsShowMainWindow,
  getMainWindow,
  hide,
  setWindowSize,
};
