import { Menu, Tray, app, nativeImage } from "electron";
import path, { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createMainWindow, getMainWindow } from "./MainWindow/MainWindow";
import { showErrorDialog } from "./Dialog";
import { is } from "@electron-toolkit/utils";
const imageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/* 图片地址:
npm run dev => out/.png
npm run build => build/.png
*/
const imagePath = path.join(imageDir, "rocket-takeoff@2x.png");
const imageDevPath = join(dirname(dirname(__dirname)), "build", "rocket-takeoff@2x.png");
// 使用高分辨率图片,用@2x结尾
const image = nativeImage.createFromPath(is.dev ? imageDevPath : imagePath);
// 自适应主题
image.setTemplateImage(true);
const tray = new Tray(image);
tray.setToolTip("VsGoTray");
const contextMenu = Menu.buildFromTemplate([
  {
    label: "退出App",
    click() {
      app.quit();
    },
  },
  {
    label: "重新创建窗口",
    click() {
      createMainWindow();
    },
  },
  {
    label: "显示窗口and打开控制台",
    click() {
      const w = getMainWindow();
      w.show();
      w.webContents.openDevTools();
    },
  },
  {
    label: "查看窗口状态",
    click() {
      const w = getMainWindow();
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
