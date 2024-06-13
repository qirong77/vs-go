import { Menu, Tray, app, nativeImage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMainWindow } from "./MainWindow/MainWindow";
const __dirname = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/* 图片地址:
npm run dev => out/.png
npm run build => build/.png
*/
const imagePath = path.join(__dirname, "rocket-takeoff@2x.png");
// 使用高分辨率图片,用@2x结尾
const image = nativeImage.createFromPath(imagePath);
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
]);
tray.setContextMenu(contextMenu);
