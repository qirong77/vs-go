import { Menu, Tray, app, nativeImage } from "electron";
import path from "node:path";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { is } from "@electron-toolkit/utils";
import { createBrowserSettingWindow } from "./BrowserSettingWindow";
import { createUserNotesWindow } from "./UserNotesWindow/UserNotesWindow";
import { createAppSettingWindow } from "./AppSettingWindow";

const imageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const imagePath = path.join(imageDir, "rocket-takeoff@2x.png");
const imageDevPath = join(dirname(dirname(__dirname)), "build", "rocket-takeoff@2x.png");

const image = nativeImage.createFromPath(is.dev ? imageDevPath : imagePath);
image.setTemplateImage(true);

const tray = new Tray(image);
tray.setToolTip("VsGo");

const contextMenu = Menu.buildFromTemplate([
  {
    label: "浏览器设置",
    click: () => createBrowserSettingWindow(),
  },
  {
    label: "笔记",
    click: () => createUserNotesWindow(),
  },
  { type: "separator" },
  {
    label: "App 设置",
    click: () => createAppSettingWindow(),
  },
  { type: "separator" },
  {
    label: "重启 App",
    click: () => {
      app.relaunch();
      app.exit(0);
    },
  },
  {
    label: "退出 App",
    click: () => app.quit(),
  },
]);

app.whenReady().then(() => {
  tray.setContextMenu(contextMenu);
});
