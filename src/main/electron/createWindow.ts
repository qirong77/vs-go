import { BrowserWindow } from "electron";
import { is } from "@electron-toolkit/utils";
import path from "node:path";

interface WindowOptions {
  width: number;
  height: number;
  title: string;
  hash: string;
  resizable?: boolean;
  autoHideMenuBar?: boolean;
}

/**
 * 创建一个标准的子窗口，加载对应 hash 路由的 renderer 页面
 */
export function createSubWindow(options: WindowOptions): BrowserWindow {
  const { width, height, title, hash, resizable = true, autoHideMenuBar = true } = options;

  const window = new BrowserWindow({
    width,
    height,
    title,
    resizable,
    autoHideMenuBar,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
    },
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    window.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}#${hash}`);
  } else {
    window.loadFile(path.join(__dirname, "../renderer/index.html"), { hash });
  }

  return window;
}
