import { BrowserWindow, shell } from "electron";
import path from "path";
import { MainWindowManager } from "../MainWindow/MainWindow";
import { BrowserItem, vsgoStore } from "../store";
const floatingWindows: BrowserWindow[] = [];
function createFloatingWindow(url = "https://www.baidu.com") {
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
    alwaysOnTop: true,
    webPreferences: {
      sandbox: false,
      preload: path.join(__dirname, "../preload/index.js"),
    },
  });
  floatingWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true, // 允许在全屏应用上显示
  });
  floatingWindow.setAlwaysOnTop(true, "floating", 1);
  floatingWindow.on("page-title-updated", (_event) => {
    const title = floatingWindow.webContents.getTitle();
    if (!title) return;
    const CACHE_SIZE = 100;
    const obj = {};
    let recentBrowserList = vsgoStore.get("recentBrowserList", []) as any[];
    recentBrowserList.forEach((item) => {
      obj[item.url] = item;
    });
    obj[url] = { name: title, url, lastVisit: new Date().getTime() };
    const newBrowserList = Object.values(obj) as BrowserItem[];
    newBrowserList.sort((a, b) => b.lastVisit! - a.lastVisit!);
    const uniqueList = newBrowserList.slice(0, CACHE_SIZE);
    vsgoStore.set("recentBrowserList", uniqueList);
  });
  floatingWindow.loadURL(url);
  floatingWindows.push(floatingWindow);
  // 处理新窗口请求，在外部浏览器中打开链接
  floatingWindow.webContents.setWindowOpenHandler(({ url: newUrl }) => {
    createFloatingWindow(newUrl);
    return { action: "deny" };
  });
  floatingWindow.webContents.on("before-input-event", (_event, input) => {
    if (
      input.modifiers.includes("meta") &&
      input.modifiers.includes("alt") &&
      input.key.toLowerCase() === "i"
    ) {
      floatingWindow.webContents.toggleDevTools();
    }
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
  floatingWindows.forEach((win) => {
    if (!win.isDestroyed() && !win.isVisible()) {
      win.showInactive();
    }
  });
}
function toogleFloatingWindowVisible() {
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
  toogleFloatingWindowVisible,
};
