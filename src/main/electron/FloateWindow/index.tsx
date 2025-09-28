import { BrowserWindow } from "electron";
import path from "path";
import { MainWindowManager } from "../MainWindow/MainWindow";
import { BrowserItem, vsgoStore } from "../store";
import { VS_GO_EVENT } from "../../../common/EVENT";
import { ipcMain } from "electron";
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
    alwaysOnTop: false,
    webPreferences: {
      sandbox: false,
      preload: path.join(__dirname, "../preload/index.js"),
    },
  });
  floatingWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true, // 允许在全屏应用上显示
  });
  const isBookMarkUrl = (vsgoStore.get("browserList", []) as BrowserItem[]).some(
    (item) => item.url === url && item.type === "bookmark"
  );
  // floatingWindow.setAlwaysOnTop(true, "floating", 0);
  floatingWindow.on("page-title-updated", (_event) => {
    if (isBookMarkUrl) return;
    const title = floatingWindow.webContents.getTitle();
    if (!title) return;
    const CACHE_SIZE = 100;
    const obj = {} as Record<string, BrowserItem>;
    const browserList = vsgoStore.get("browserList", []) as BrowserItem[];
    browserList.forEach((item) => {
      obj[item.url] = item;
    });
    obj[url] = {
      name: title,
      url,
      lastVisit: new Date().getTime(),
      type: "history",
      id: url + new Date().getTime() + "",
    };
    const newBrowserList = Object.values(obj) as BrowserItem[];
    newBrowserList.sort((a, b) => b.lastVisit! - a.lastVisit!);
    const uniqueList = newBrowserList.slice(0, CACHE_SIZE);
    vsgoStore.set("browserList", uniqueList);
  });
  floatingWindow.loadURL(url);
  floatingWindows.push(floatingWindow);
  // 处理新窗口请求，在外部浏览器中打开链接
  floatingWindow.webContents.setWindowOpenHandler(({ url: newUrl }) => {
    createFloatingWindow(newUrl);
    return { action: "deny" };
  });
  ipcMain.on(VS_GO_EVENT.FLOATING_WINDOW_TOGGLE_DEVTOOLS, (event) => {
    if (event.sender === floatingWindow.webContents) {
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
    createFloatingWindow("https://www.google.com");
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
