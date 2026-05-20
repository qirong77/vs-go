import { Menu, Tray, app, nativeImage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { is } from "@electron-toolkit/utils";
import { createSettingsWindow } from "@windows/settings/electron";
import { createLogWindow } from "@windows/log-viewer/electron";

const thisFile = fileURLToPath(import.meta.url);
const outDir = path.resolve(path.dirname(thisFile), "..");
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
    label: "设置",
    click: () => createSettingsWindow(),
  },
  {
    label: "日志",
    click: () => createLogWindow(),
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
