import { Menu, Tray, app, nativeImage, clipboard } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { is } from "@electron-toolkit/utils";
import { createSettingsWindow } from "@windows/settings/electron";
import { createLogWindow } from "@windows/log-viewer/electron";
import { createTerminalWindow } from "@windows/terminal/electron";
import { openRemoteBrowserDocs } from "@windows/browser/electron/remote-browser-docs";
import { TabbedBrowserWindowManager } from "@windows/browser/electron/TabbedBrowserWindowManager";

const thisFile = fileURLToPath(import.meta.url);
const outDir = path.resolve(path.dirname(thisFile), "..");
const projectRoot = path.resolve(outDir, "..");

const imagePath = is.dev
  ? path.join(projectRoot, "build", "rocket-takeoff@2x.png")
  : path.join(outDir, "rocket-takeoff@2x.png");

export function initTray(): void {
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
    {
      label: "终端",
      click: () => createTerminalWindow(),
    },
    {
      label: "远程浏览器控制",
      submenu: [
        {
          label: "打开文档",
          click: () => openRemoteBrowserDocs(),
        },
        {
          label: "打开浏览器窗口",
          click: () => TabbedBrowserWindowManager.showAll(),
        },
        { type: "separator" },
        {
          label: "复制服务地址",
          click: () => clipboard.writeText("http://127.0.0.1:18766"),
        },
      ],
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

  tray.setContextMenu(contextMenu);
}
