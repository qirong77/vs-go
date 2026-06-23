import contextMenu from "electron-context-menu";
import { BrowserWindow, WebContentsView } from "electron";
import { createCookieManagerWindow } from "@windows/cookie-manager/electron";
import { createUserNotesWindow } from "@windows/user-notes/electron";
import { TabbedBrowserWindowManager } from "@windows/browser/electron/TabbedBrowserWindowManager";

export interface ContextMenuOptions {
  /** 若提供，则在右键菜单中追加"设置"项 */
  onOpenSettings?: () => void;
}

export function setupContextMenu(
  window: BrowserWindow | WebContentsView,
  options: ContextMenuOptions = {}
): void {
  contextMenu({
    window,
    showSaveImageAs: true,
    showCopyImageAddress: true,
    showSearchWithGoogle: false,
    showInspectElement: false,
    labels: {
      copy: "复制",
      paste: "粘贴",
      cut: "剪切",
      selectAll: "全选",
      copyLink: "复制链接",
      copyImage: "复制图片",
      copyImageAddress: "复制图片地址",
      saveImage: "图片另存为...",
    },
    append: (_defaultActions, _parameters, browserWindow) => [
      {
        label: "查看保存的 Cookie",
        click: () => {
          createCookieManagerWindow(TabbedBrowserWindowManager.getLastFocusedActiveUrl());
        },
      },
      {
        label: "查看笔记",
        click: () => createUserNotesWindow(),
      },
      ...(options.onOpenSettings
        ? [
            { type: "separator" as const },
            {
              label: "设置",
              click: () => options.onOpenSettings?.(),
            },
          ]
        : []),
      { type: "separator" },
      {
        label: "检查元素",
        click: () => {
          if ("webContents" in browserWindow) {
            (browserWindow as BrowserWindow).webContents.inspectElement(0, 0);
          }
        },
      },
    ],
  });
}
