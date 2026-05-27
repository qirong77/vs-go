import { BrowserWindow, screen } from "electron";
import { is } from "@electron-toolkit/utils";
import path from "node:path";
import { vsgoLog } from "@platform/log/logger";
import {
  prepareWindowForActiveSpace,
  schedulePinWindowToActiveSpace,
} from "@platform/electron/macosWorkspace";

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

/** 在光标所在显示器的工作区居中显示并置顶、聚焦 */
export function presentWindowOnActiveDisplay(window: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const [w, h] = window.getSize();
  const { x: workX, y: workY, width: workW, height: workH } = display.workArea;
  const x = workX + Math.max(0, Math.floor((workW - w) / 2));
  const y = workY + Math.max(0, Math.floor((workH - h) / 2));
  const visibleBefore = window.isVisible();
  const focusedBefore = window.isFocused();

  prepareWindowForActiveSpace(window);
  schedulePinWindowToActiveSpace(window);
  window.setPosition(x, y);
  if (!window.isVisible()) {
    window.show();
  }
  window.moveTop();
  window.focus();

  vsgoLog("Window", "presentWindowOnActiveDisplay", {
    detail: {
      cursor,
      displayId: display.id,
      workArea: display.workArea,
      position: { x, y },
      windowSize: { w, h },
      visibleBefore,
      focusedBefore,
      visibleAfter: window.isVisible(),
      focusedAfter: window.isFocused(),
      bounds: window.getBounds(),
    },
  });
}
