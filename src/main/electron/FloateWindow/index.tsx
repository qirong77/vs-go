import { BrowserWindow } from "electron";
import path from "path";
import { MainWindowManager } from "../MainWindow/MainWindow";
import { BrowserItem, vsgoStore } from "../store";
const floatingWindows: BrowserWindow[] = [];
function createFloatingWindow(url = "https://www.baidu.com") {
  const oldWindow = floatingWindows.find(
    (win) => !win.isDestroyed() && win.webContents.getURL() === url,
  );
  if (oldWindow) {
    oldWindow.center();
    oldWindow.show();
    oldWindow.focus();
    return oldWindow;
  }
  const floatingWindow = new BrowserWindow({
    width: 800,
    height: 600,
    alwaysOnTop: true,
    webPreferences: {
      sandbox: false,
      preload: path.join(__dirname, "../preload/index.js"),
    },
  });
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
  floatingWindow.on("closed", () => {
    const index = floatingWindows.indexOf(floatingWindow);
    if (index > -1) {
      floatingWindows.splice(index, 1);
    }
  });
  // floatingWindow.on("focus", () => {
  //     MainWindowManager.hide();
  // });
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
    if (!win.isDestroyed()) {
      // win.center();
      win.show();
    }
  });
}

export const FloatingWindowManager = {
  createFloatingWindow,
  HideAllFloatingWindows,
  ShowAllFloatingWindows,
};
