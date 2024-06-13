import { is } from "@electron-toolkit/utils";
import { BrowserWindow, screen } from "electron";
import path from "path";
import { VS_GO_EVENT } from "../../../common/EVENT";
let window = createMainWindow();

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
  const { x, y } = screen.getCursorScreenPoint();
  const currentDisplay = screen.getDisplayNearestPoint({ x, y });
  window.setPosition(currentDisplay.workArea.x, currentDisplay.workArea.y);
  window.show();
}
// export function showWindowOnCurrentDesktop2(window: BrowserWindow) {
//   window.show();
//   window.focus();
//   window.center();
// }

export function toogleIsShowMainWindow() {
  if (window.isVisible()) {
    window.hide();
  } else {
    showWindowOnCurrentDesktop();
  }
}
export function toogleDevTools() {
  window.isVisible() && window.webContents.toggleDevTools();
}

export function setWindowSize(w,h) {
  window.setSize(w, h);
}

export function hide() {
  window.hide();
}