import { app, BrowserWindow, session } from "electron";
import path from "path";
import { MainWindowManager } from "../MainWindow/MainWindow";
import { VS_GO_EVENT } from "../../../common/EVENT";
import { setupContextMenu } from "../contextMenu";

const floatingWindows: BrowserWindow[] = [];
let lastWindowUrl = "";

// 从 URL 提取域名
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    return "";
  }
}

// 更新窗口标题
function updateWindowTitle(window: BrowserWindow, pageTitle: string, url: string) {
  const domain = extractDomain(url);
  const title = domain ? `${pageTitle} - ${domain}` : pageTitle;
  window.setTitle(title);
}

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
    throw new Error("URL is empty");
  }
  
  // 提取要访问的 URL 的域名
  const targetDomain = extractDomain(url);
  
  // 检查是否已存在同域名的窗口
  if (targetDomain) {
    const existingWindow = floatingWindows.find((win) => {
      if (win.isDestroyed()) return false;
      const winUrl = win.webContents.getURL();
      const winDomain = extractDomain(winUrl);
      return winDomain === targetDomain;
    });
    
    // 如果找到同域名窗口，复用它
    if (existingWindow) {
      if (!existingWindow.isVisible()) {
        existingWindow.showInactive();
      }
      existingWindow.focus();
      // 如果 URL 不同，导航到新 URL
      if (existingWindow.webContents.getURL() !== url) {
        existingWindow.loadURL(url);
      }
      return existingWindow;
    }
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
  
  // 页面加载完成后设置标题
  floatingWindow.webContents.on('did-finish-load', () => {
    const pageTitle = floatingWindow.webContents.getTitle();
    const currentUrl = floatingWindow.webContents.getURL();
    updateWindowTitle(floatingWindow, pageTitle, currentUrl);
  });
  
  // 监听页面标题变化
  floatingWindow.webContents.on('page-title-updated', (event, title) => {
    event.preventDefault(); // 阻止默认标题更新
    const currentUrl = floatingWindow.webContents.getURL();
    updateWindowTitle(floatingWindow, title, currentUrl);
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
