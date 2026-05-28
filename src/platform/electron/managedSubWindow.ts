import type { BrowserWindow } from "electron";
import {
  createSubWindow,
  presentWindowOnCurrentDesktop,
  type SubWindowOptions,
} from "@platform/electron/createWindow";
import { setupContextMenu } from "@platform/electron/contextMenu";

export interface ManagedSubWindowOptions extends SubWindowOptions {
  contextMenu?: boolean;
  onCreated?: (window: BrowserWindow) => void;
  onReuse?: (window: BrowserWindow) => void;
  createWindow?: () => BrowserWindow;
}

type WindowRef = { current: BrowserWindow | null };

/**
 * 单例子窗口：已存在则 present；否则创建并缓存引用。
 * 可通过 createWindow 自定义创建逻辑（默认走 createSubWindow + hash 路由）。
 */
export function openManagedSubWindow(
  ref: WindowRef,
  options: ManagedSubWindowOptions
): BrowserWindow {
  const { contextMenu = true, onCreated, onReuse, createWindow, ...windowOptions } = options;

  if (ref.current && !ref.current.isDestroyed()) {
    onReuse?.(ref.current);
    presentWindowOnCurrentDesktop(ref.current);
    return ref.current;
  }

  const window = createWindow ? createWindow() : createSubWindow(windowOptions);
  if (contextMenu && !createWindow) {
    setupContextMenu(window);
  }
  onCreated?.(window);
  window.on("closed", () => {
    ref.current = null;
  });
  ref.current = window;
  presentWindowOnCurrentDesktop(window);
  return window;
}

/** 便于各模块使用 `const ref = { current: null as BrowserWindow | null }` */
export function createWindowRef(): WindowRef {
  return { current: null };
}
