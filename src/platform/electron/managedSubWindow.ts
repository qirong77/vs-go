import type { BrowserWindow } from "electron";
import {
  createSubWindow,
  presentWindowOnCurrentDesktop,
  type SubWindowOptions,
} from "@platform/electron/createWindow";
import { setupContextMenu } from "@platform/electron/contextMenu";

export interface ManagedSubWindowOptions extends SubWindowOptions {
  /** 默认 true：挂载右键菜单 */
  contextMenu?: boolean;
  onCreated?: (window: BrowserWindow) => void;
  onReuse?: (window: BrowserWindow) => void;
}

type WindowRef = { current: BrowserWindow | null };

/**
 * 单例子窗口：已存在则 present；否则 createSubWindow 并缓存引用。
 */
export function openManagedSubWindow(
  ref: WindowRef,
  options: ManagedSubWindowOptions
): BrowserWindow {
  const { contextMenu = true, onCreated, onReuse, ...windowOptions } = options;

  if (ref.current && !ref.current.isDestroyed()) {
    onReuse?.(ref.current);
    presentWindowOnCurrentDesktop(ref.current);
    return ref.current;
  }

  const window = createSubWindow(windowOptions);
  if (contextMenu) {
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
