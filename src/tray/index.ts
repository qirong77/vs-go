import { Menu, Tray, app, nativeImage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { is } from "@electron-toolkit/utils";
import { createBrowserSettingWindow } from "@windows/browser/electron/browser-setting-window";
import { createUserNotesWindow } from "@windows/user-notes/electron";
import { createAppSettingWindow } from "@windows/app-setting/electron";
import { createDisplayWindow } from "@windows/display-manager/electron";
import { createScriptEditorWindow } from "@windows/script-editor/electron";

// dev:   build/rocket-takeoff@2x.png（项目根目录下）
// prod:  out/rocket-takeoff@2x.png（通过 copyTrayIconPlugin 自动拷贝）
const thisFile = fileURLToPath(import.meta.url);
const outDir = path.resolve(path.dirname(thisFile), ".."); // out/
const projectRoot = path.resolve(outDir, "..");

const imagePath = is.dev
  ? path.join(projectRoot, "build", "rocket-takeoff@2x.png")
  : path.join(outDir, "rocket-takeoff@2x.png");

const image = nativeImage.createFromPath(imagePath);
image.setTemplateImage(true);

const tray = new Tray(image);
tray.setToolTip("VsGo");

const contextMenu = Menu.buildFromTemplate([
  {
    label: "笔记",
    click: () => createUserNotesWindow(),
  },

  {
    label: "屏幕管理",
    click: () => createDisplayWindow(),
  },
  {
    label: "App 设置",
    click: () => createAppSettingWindow(),
  },
  {
    label: "浏览器设置",
    click: () => createBrowserSettingWindow(),
  },
  {
    label: "脚本",
    click: () => createScriptEditorWindow(),
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
