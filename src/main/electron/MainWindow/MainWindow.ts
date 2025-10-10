import { is } from "@electron-toolkit/utils";
import { app, BrowserWindow, dialog } from "electron";
import path from "path";
import { VS_GO_EVENT } from "../../../common/EVENT";
import { createFloatingWindowNew } from "../../createFloatingWindowNew";
let _mainWindow: BrowserWindow;
app.once("ready", () => {
  _mainWindow = createMainWindow();
});
function createMainWindow() {
  const window = new BrowserWindow({
    width: 700,
    height: 600,
    show: true,
    frame: is.dev ? true : false,
    title: "Vsgo",
    autoHideMenuBar: is.dev ? false : true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });
  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    window.loadURL(process.env["ELECTRON_RENDERER_URL"] + "#/main-window");
  } else {
    window.loadFile(path.join(__dirname, "../renderer/index.html"), { hash: "/main-window" });
  }

  // 添加快捷键支持
  window.webContents.on("before-input-event", (_event, input) => {
    if (
      input.modifiers.includes("meta") &&
      input.modifiers.includes("alt") &&
      input.key.toLowerCase() === "i"
    ) {
      window.webContents.toggleDevTools();
    }
  });
  window.on('maximize', () => {
    dialog.showMessageBox({
      type: 'info',
      message: 'Main窗口被最大化了！',
      buttons: ['确定']
    });
  });
  // 在docker栏隐藏,支持浮动
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.setAlwaysOnTop(true, "torn-off-menu", 10);
  window.on("show", () => {
    window.webContents.send(VS_GO_EVENT.MAIN_WINDOW_SHOW);
  });
  return window;
}

function showWindowOnCurrentDesktop() {
  _mainWindow.center();
  _mainWindow.show();
  _mainWindow.focus();
}

function toggleIsShowMainWindow() {
  if (!_mainWindow) {
    _mainWindow = createMainWindow();
    showWindowOnCurrentDesktop();
    return;
  }
  if (_mainWindow.isDestroyed()) {
    _mainWindow = createMainWindow();
    showWindowOnCurrentDesktop();
    return;
  }
  if (_mainWindow.isVisible()) {
    _mainWindow.hide();
  } else {
    showWindowOnCurrentDesktop();
  }
}
function toogleDevTools() {
  _mainWindow.isVisible() && _mainWindow.webContents.toggleDevTools();
}

function setWindowSize(w: number, h: number) {
  _mainWindow.setSize(w, h);
}

function hide() {
  _mainWindow.hide();
}

function getMainWindow() {
  return _mainWindow;
}
export const MainWindowManager = {
  toggleIsShowMainWindow,
  toogleDevTools,
  getMainWindow,
  hide,
  setWindowSize,
};
