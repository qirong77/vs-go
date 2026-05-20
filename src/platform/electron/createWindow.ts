import { BrowserWindow, screen } from "electron";
import { is } from "@electron-toolkit/utils";
import path from "node:path";

export interface SubWindowOptions {
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
export function createSubWindow(options: SubWindowOptions): BrowserWindow {
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

/** 居中到当前屏并显示、聚焦 */
export function presentWindowOnCurrentDesktop(window: BrowserWindow): void {
  window.center();
  window.show();
  window.focus();
}

/** 在光标所在屏幕附近显示并置顶、聚焦（用于搜索窗等 Spotlight 式唤起） */
export function presentWindowAtCursor(window: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const [w] = window.getSize();
  const x = Math.max(display.workArea.x, cursor.x - Math.floor(w / 2));
  const y = Math.max(display.workArea.y, cursor.y - 20);

  if (process.platform === "darwin") {
    window.setVisibleOnAllWorkspaces(false);
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  window.setPosition(x, y);
  if (!window.isVisible()) {
    window.show();
  }
  window.moveTop();
  window.focus();
}
