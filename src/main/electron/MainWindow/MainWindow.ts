import { is } from "@electron-toolkit/utils";
import { app, BrowserWindow } from "electron";
import path from "path";
import { VS_GO_EVENT } from "../../../common/EVENT";
let _mainWindow: BrowserWindow;
app.once('ready', () => {
  _mainWindow = createMainWindow();
})
export function createMainWindow() {
  const window = new BrowserWindow({
    width: 850,
    height: 600,
    show: true,
    frame: is.dev ? true : false,
    autoHideMenuBar: is.dev ? false : true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });
  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  // 在docker栏隐藏,支持浮动
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.setAlwaysOnTop(true, "torn-off-menu", 999);
  window.on("show", () => {
    window.webContents.send(VS_GO_EVENT.MAIN_WINDOW_SHOW);
  });
  window.on("blur", () => {
    window.hide();
  });
  return window;
}
export function showWindowOnCurrentDesktop() {
  // const { x, y } = screen.getCursorScreenPoint();
  // const currentDisplay = screen.getDisplayNearestPoint({ x, y });
  // const [w,h] = _mainWindow.getSize();
  // _mainWindow.setPosition(Math.floor(currentDisplay.workArea.x / 2 + w / 2), Math.floor(currentDisplay.workArea.y / 2 + h / 2));
  _mainWindow.center();
  _mainWindow.show();
  // _mainWindow.focus();
  // _mainWindow.center();
}
// export function showWindowOnCurrentDesktop2(window: BrowserWindow) {
//   window.show();
//   window.focus();
//   window.center();
// }

export function toogleIsShowMainWindow() {
  if (_mainWindow.isDestroyed()) {
    _mainWindow = createMainWindow();
    showWindowOnCurrentDesktop();
    return
  }
  if (_mainWindow.isVisible()) {
    _mainWindow.hide();
  } else {
    _mainWindow.show();
    showWindowOnCurrentDesktop();
  }
}
export function toogleDevTools() {
  _mainWindow.isVisible() && _mainWindow.webContents.toggleDevTools();
}

export function setWindowSize(w: number, h: number) {
  _mainWindow.setSize(w, h);
}

export function hide() {
  _mainWindow.hide();
}

export function getMainWindow() {
  return _mainWindow
}
