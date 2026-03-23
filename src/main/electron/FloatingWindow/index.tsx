import { app, BrowserWindow, session } from "electron";
import path from "node:path";
import { VS_GO_EVENT } from "../../../common/EVENT";
import { MainWindowManager } from "../MainWindow/MainWindow";
import { setupContextMenu } from "../contextMenu";

const floatingWindows: BrowserWindow[] = [];
let lastWindowUrl = "";

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function updateWindowTitle(window: BrowserWindow, pageTitle: string, url: string): void {
  const domain = extractDomain(url);
  window.setTitle(domain ? `${pageTitle} - ${domain}` : pageTitle);
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };

    delete responseHeaders["x-frame-options"];
    delete responseHeaders["X-Frame-Options"];

    if (responseHeaders["content-security-policy"] || responseHeaders["Content-Security-Policy"]) {
      responseHeaders["content-security-policy"] = [
        "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;",
      ];
    }

    callback({ cancel: false, responseHeaders });
  });
});

function createFloatingWindow(url: string): BrowserWindow {
  if (!url) throw new Error("URL is empty");

  const targetDomain = extractDomain(url);

  if (targetDomain) {
    const existing = floatingWindows.find((win) => {
      if (win.isDestroyed()) return false;
      return extractDomain(win.webContents.getURL()) === targetDomain;
    });

    if (existing) {
      if (!existing.isVisible()) existing.showInactive();
      existing.focus();
      if (existing.webContents.getURL() !== url) existing.loadURL(url);
      return existing;
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
  floatingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  floatingWindow.webContents.on("did-finish-load", () => {
    const pageTitle = floatingWindow.webContents.getTitle();
    const currentUrl = floatingWindow.webContents.getURL();
    updateWindowTitle(floatingWindow, pageTitle, currentUrl);
  });

  floatingWindow.webContents.on("page-title-updated", (event, title) => {
    event.preventDefault();
    updateWindowTitle(floatingWindow, title, floatingWindow.webContents.getURL());
  });

  floatingWindow.on("close", () => {
    lastWindowUrl = floatingWindow.webContents.getURL();
  });

  floatingWindow.on("closed", () => {
    const index = floatingWindows.indexOf(floatingWindow);
    if (index > -1) floatingWindows.splice(index, 1);
  });

  floatingWindow.on("moved", () => {
    MainWindowManager.hide();
  });

  setupContextMenu(floatingWindow);
  floatingWindow.center();
  floatingWindow.show();
  return floatingWindow;
}

function hideAll(): void {
  floatingWindows.forEach((win) => {
    if (!win.isDestroyed()) win.hide();
  });
}

function showAll(): void {
  if (!floatingWindows.length) {
    createFloatingWindow(lastWindowUrl || "https://www.google.com");
    return;
  }

  floatingWindows.forEach((win) => {
    if (!win.isDestroyed() && !win.isVisible()) win.showInactive();
  });

  const lastWindow = floatingWindows[floatingWindows.length - 1];
  lastWindow.webContents.send(VS_GO_EVENT.FLOATING_WINDOW_FOCUS_INPUT);
  lastWindow.show();
}

function toggleVisible(): void {
  const isVisible = floatingWindows.some((win) => !win.isDestroyed() && win.isVisible());
  if (isVisible) {
    hideAll();
  } else {
    showAll();
  }
}

export const FloatingWindowManager = {
  createFloatingWindow,
  hideAll,
  showAll,
  toggleVisible,
};
