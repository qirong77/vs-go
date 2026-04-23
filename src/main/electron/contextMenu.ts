import contextMenu from "electron-context-menu";
import { BrowserWindow, WebContentsView } from "electron";
import { createCookieManagerWindow } from "./CookieManagerWindow";
import { createUserNotesWindow } from "./UserNotesWindow/UserNotesWindow";

export function setupContextMenu(window: BrowserWindow | WebContentsView): void {
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
          let currentUrl = "";
          if ("webContents" in browserWindow) {
            currentUrl = (browserWindow as BrowserWindow).webContents.getURL();
          }
          createCookieManagerWindow(currentUrl);
        },
      },
      {
        label: "查看笔记",
        click: () => createUserNotesWindow(),
      },
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
