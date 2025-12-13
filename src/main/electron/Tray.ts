import { Menu, Tray, app, nativeImage } from "electron";
import path, { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
import { createBrowserSettingWindow } from "./BrowserSettingWindow";
import { createTerminalWindow } from "./Terminal/TerminalWindow";

const contextMenu = Menu.buildFromTemplate([
  {
    label: "新建终端",
    click() {
      createTerminalWindow();
    },
  },
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
]);
app.whenReady().then(() => {
  tray.setContextMenu(contextMenu);
});
