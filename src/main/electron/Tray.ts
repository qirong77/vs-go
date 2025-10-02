import { Menu, Tray, app, nativeImage } from "electron";
import path, { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { showErrorDialog } from "./Dialog";
import { is } from "@electron-toolkit/utils";
const imageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/* 图片地址:
npm run dev => out/.png
npm run build => build/.png
*/
/* 
如果没有生效，检查rocket-takeoff@2x.png是否在build和out目录下
*/
const imagePath = path.join(imageDir, "rocket-takeoff@2x.png");
const imageDevPath = join(dirname(dirname(__dirname)), "build", "rocket-takeoff@2x.png");
// 使用高分辨率图片,用@2x结尾
const image = nativeImage.createFromPath(is.dev ? imageDevPath : imagePath);
// 自适应主题
image.setTemplateImage(true);
const tray = new Tray(image);
tray.setToolTip("VsGoTray");

import { BrowserWindow } from "electron";
import { MainWindowManager } from "./MainWindow/MainWindow";
let browserSettingWindow: BrowserWindow | null = null;
function createBrowserSettingWindow() {
  if (browserSettingWindow && !browserSettingWindow.isDestroyed()) {
    browserSettingWindow.focus();
    return;
  }
  MainWindowManager.hide();
  browserSettingWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: "浏览器设置",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow cross-origin in development
    },
    autoHideMenuBar: false, // Enable menu bar to support right-click context menus
    resizable: true,
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    browserSettingWindow.loadURL(process.env["ELECTRON_RENDERER_URL"] + "#/browser-setting");
  } else {
    browserSettingWindow.loadFile(path.join(__dirname, "../renderer/index.html"), {
      hash: "browser-setting",
    });
  }

  // 添加跨平台快捷键支持
  browserSettingWindow.webContents.on("before-input-event", (_event, input) => {
    // macOS: Command+Option+I, Windows/Linux: Ctrl+Shift+I
    if (
      ((process.platform === "darwin" && 
        input.modifiers.includes("meta") && 
        input.modifiers.includes("alt")) ||
       (process.platform !== "darwin" && 
        input.modifiers.includes("control") && 
        input.modifiers.includes("shift"))) &&
      input.key.toLowerCase() === "i"
    ) {
      browserSettingWindow?.webContents.toggleDevTools();
    }
  });

  browserSettingWindow.on("closed", () => {
    browserSettingWindow = null;
  });
}

const contextMenu = Menu.buildFromTemplate([
  {
    label: "浏览器设置",
    click() {
      createBrowserSettingWindow();
    },
  },
  {
    label: "退出App",
    click() {
      app.quit();
    },
  },

  {
    label: "查看窗口状态",
    click() {
      const w = MainWindowManager.getMainWindow();
      const infos: string[] = [];
      infos.push("w.isDestroyed:" + w.isDestroyed() + "\n");
      infos.push("w.webContents.isCrashed:" + w.webContents.isCrashed() + "\n");
      infos.push("w.webContents.isDestroyed:" + w.webContents.isDestroyed() + "\n");
      infos.push("w.webContents.isLoadingMainFrame:" + w.webContents.isLoadingMainFrame() + "\n");
      showErrorDialog(infos.join(""));
    },
  },
]);
tray.setContextMenu(contextMenu);
