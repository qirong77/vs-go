import { app, BrowserWindow, session } from "electron";
import path from "path";
import { MainWindowManager } from "../MainWindow/MainWindow";
import { VS_GO_EVENT } from "../../../common/EVENT";
import { showErrorDialog } from "../Dialog";
import { setupContextMenu } from "../contextMenu";
const floatingWindows: BrowserWindow[] = [];
let lastWindowUrl = "";
app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders || {};
    // 处理 X-Frame-Options 头
    if (responseHeaders["x-frame-options"] || responseHeaders["X-Frame-Options"]) {
      delete responseHeaders["x-frame-options"];
      delete responseHeaders["X-Frame-Options"];
    }
    // 处理 Content-Security-Policy 头
    if (responseHeaders["content-security-policy"] || responseHeaders["Content-Security-Policy"]) {
      responseHeaders["content-security-policy"] = [
        "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;",
      ];
    }
    callback({ cancel: false, responseHeaders });
  });
});
function createFloatingWindow(url: string) {
  if (!url) {
    showErrorDialog("无法创建浮动窗口，URL 为空");
    throw new Error("URL is empty");
  }
  const oldWindow = floatingWindows.find(
    (win) => !win.isDestroyed() && win.webContents.getURL() === url
  );
  if (oldWindow) {
    if (!oldWindow.isVisible()) {
      oldWindow.showInactive();
    }
    return oldWindow;
  }
  const floatingWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    alwaysOnTop: false,
    webPreferences: {
      sandbox: false,
      contextIsolation: false,
      preload: path.join(__dirname, "../preload/index.js"),
    },
  });
  floatingWindow.loadURL(url);
  floatingWindows.push(floatingWindow);
  floatingWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true, // 允许在全屏应用上显示
  });
  floatingWindow.on("close", () => {
    lastWindowUrl = floatingWindow.webContents.getURL();
  });
  floatingWindow.on("closed", () => {
    const index = floatingWindows.indexOf(floatingWindow);
    if (index > -1) {
      floatingWindows.splice(index, 1);
    }
  });
  floatingWindow.on("moved", () => {
    MainWindowManager.hide();
  });
  
  // 设置右键菜单
  setupContextMenu(floatingWindow);
  
  floatingWindow.center();
  floatingWindow.show();
  return floatingWindow;
}
function HideAllFloatingWindows() {
  floatingWindows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.hide();
    }
  });
}
function ShowAllFloatingWindows() {
  if (!floatingWindows.length) {
    createFloatingWindow(lastWindowUrl || "https://www.google.com");
    return;
  }
  floatingWindows.forEach((win) => {
    if (!win.isDestroyed() && !win.isVisible()) {
      win.showInactive();
    }
  });
  const lastWindow = floatingWindows[floatingWindows.length - 1];
  lastWindow.webContents.send(VS_GO_EVENT.FLOATING_WINDOW_FOCUS_INPUT);
  lastWindow.show();
}
function toggleFloatingWindowVisible() {
  const isVisible = floatingWindows.some((win) => !win.isDestroyed() && win?.isVisible());
  if (isVisible) {
    HideAllFloatingWindows();
  } else {
    ShowAllFloatingWindows();
  }
}
export const FloatingWindowManager = {
  createFloatingWindow,
  HideAllFloatingWindows,
  ShowAllFloatingWindows,
  toggleFloatingWindowVisible,
};
