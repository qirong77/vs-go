import contextMenu from "electron-context-menu";
import { BrowserWindow } from "electron";
import { createCookieManagerWindow } from "./CookieManagerWindow";

/**
 * 为窗口设置右键菜单
 * 包含常用操作：复制、粘贴、剪切、全选、刷新、开发者工具
 */
export function setupContextMenu(window: BrowserWindow) {
  contextMenu({
    window,
    showSaveImageAs: true, // 图片右键保存
    showCopyImageAddress: true, // 复制图片地址
    showSearchWithGoogle: false, // 不显示用谷歌搜索（减少选项）
    showInspectElement: true, // 显示检查元素
    labels: {
      copy: "复制",
      paste: "粘贴",
      cut: "剪切",
      selectAll: "全选",
      copyLink: "复制链接",
      copyImage: "复制图片",
      copyImageAddress: "复制图片地址",
      saveImage: "图片另存为...",
      inspect: "检查元素",
    },
    append: (_defaultActions, _parameters, browserWindow) => [
      {
        label: "查看保存的 Cookie",
        click: () => {
          let currentUrl = "";
          if ("webContents" in browserWindow) {
            currentUrl = browserWindow.webContents.getURL();
          } else if ("getURL" in browserWindow) {
            currentUrl = (browserWindow as any).getURL();
          }
          createCookieManagerWindow(currentUrl);
        },
      },
    ],
  });
}
