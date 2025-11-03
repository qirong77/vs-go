import { BrowserWindow, clipboard, ipcMain, Menu, shell } from "electron";
import { BrowserItem, vsgoStore } from "../store";
import { readFileSync } from "node:fs";
import path from "node:path";
import { VS_GO_EVENT } from "../../../common/EVENT";
const loadMonacoEditorString = readFileSync(
  path.join(__dirname, "../../monaco-markdown-dev/main.js"),
  "utf-8"
);
export function handleFloatWindowWebContentEvents(props: {
  floatingWindow: BrowserWindow;
  url: string;
  createFloatingWindow: (url: string) => BrowserWindow;
}) {
  const { floatingWindow, url, createFloatingWindow } = props;
  const isBookMarkUrl = (vsgoStore.get("browserList", []) as BrowserItem[]).some(
    (item) => item.url === url && item.type === "bookmark"
  );
  floatingWindow.on("page-title-updated", (_event) => {
    if (isBookMarkUrl) return;
    const title = floatingWindow.webContents.getTitle();
    if (!title) return;
    const CACHE_SIZE = 100;
    const obj = {} as Record<string, BrowserItem>;
    const browserList = vsgoStore.get("browserList", []) as BrowserItem[];
    browserList.forEach((item) => {
      obj[item.url] = item;
    });
    obj[url] = {
      name: title,
      url,
      lastVisit: new Date().getTime(),
      type: "history",
      id: url + new Date().getTime() + "",
    };
    const newBrowserList = Object.values(obj) as BrowserItem[];
    newBrowserList.sort((a, b) => b.lastVisit! - a.lastVisit!);
    const uniqueList = newBrowserList.slice(0, CACHE_SIZE);
    vsgoStore.set("browserList", uniqueList);
  });
  // floatingWindow.webContents.on("before-input-event", (_event, input) => {
  //   if (
  //     input.modifiers.includes("meta") &&
  //     input.modifiers.includes("alt") &&
  //     input.key.toLowerCase() === "i"
  //   ) {
  //     floatingWindow.webContents.toggleDevTools();
  //   }
  // });
  floatingWindow.webContents.on("did-navigate-in-page", (_event, url) => {
    console.log("in-page navigated to:", url);
    const canGoBack = floatingWindow.webContents.navigationHistory.canGoBack();
    const canGoForward = floatingWindow.webContents.navigationHistory.canGoForward();
    floatingWindow.webContents.send("navigation-state-changed", { canGoBack, canGoForward, url });
  });
  floatingWindow.webContents.on("did-finish-load", () => {
    const canGoBack = floatingWindow.webContents.navigationHistory.canGoBack();
    const canGoForward = floatingWindow.webContents.navigationHistory.canGoForward();
    floatingWindow.webContents.send("navigation-state-changed", { canGoBack, canGoForward, url });
    floatingWindow.webContents.executeJavaScript(loadMonacoEditorString);
  });
  floatingWindow.webContents.on("did-navigate", (_event, url) => {
    console.log("navigated to:", url);
    const canGoBack = floatingWindow.webContents.navigationHistory.canGoBack();
    const canGoForward = floatingWindow.webContents.navigationHistory.canGoForward();
    floatingWindow.webContents.send("navigation-state-changed", { canGoBack, canGoForward, url });
  });
  // 处理新窗口请求，在外部浏览器中打开链接
  floatingWindow.webContents.setWindowOpenHandler(({ url: newUrl }) => {
    console.log("Request to open new window with URL:", newUrl);
    createFloatingWindow(newUrl);
    return { action: "deny" };
  });
  ipcMain.on(VS_GO_EVENT.FLOATING_WINDOW_NAVIGATION, (event, action: "back" | "forward") => {
    if (event.sender === floatingWindow.webContents) {
      switch (action) {
        case "back":
          if (floatingWindow.webContents.navigationHistory.canGoBack()) {
            floatingWindow.webContents.navigationHistory.goBack();
          }
          break;
        case "forward":
          if (floatingWindow.webContents.navigationHistory.canGoForward()) {
            floatingWindow.webContents.navigationHistory.goForward();
          }
          break;
      }
      // 发送导航状态更新
      const canGoBack = floatingWindow.webContents.navigationHistory.canGoBack();
      const canGoForward = floatingWindow.webContents.navigationHistory.canGoForward();
      floatingWindow.webContents.send(
        VS_GO_EVENT.FLOATING_WINDOW_UPDATE_TARGET_URL,
        floatingWindow.webContents.getURL()
      );
      floatingWindow.webContents.send("navigation-state-changed", { canGoBack, canGoForward });
    }
  });
  handleContextMenu(floatingWindow, createFloatingWindow);
}

function handleContextMenu(
  floatingWindow: BrowserWindow,
  createFloatingWindow: (url: string) => BrowserWindow
) {
  // 添加右键菜单支持
  floatingWindow.webContents.on("context-menu", (_event, params) => {
    const { x, y } = params;
    const template: Electron.MenuItemConstructorOptions[] = [];
    const textContent = params.selectionText || "";
    const isSelectionLink = /^https?:\/\//.test(textContent.trim());
    if (isSelectionLink) {
      template.push({
        label: "在新窗口中打开链接",
        click: () => {
          createFloatingWindow(textContent.trim());
        },
      });
    } else if (params.linkURL) {
      template.push(
        {
          label: "在新窗口中打开链接",
          click: () => {
            createFloatingWindow(params.linkURL);
          },
        },

        {
          label: "在外部浏览器中打开",
          click: () => {
            shell.openExternal(params.linkURL);
          },
        },
        {
          label: "复制链接地址",
          click: () => {
            clipboard.writeText(params.linkURL);
          },
        },
        { type: "separator" }
      );
    }

    // 如果右键点击的是图片
    if (params.srcURL && params.mediaType === "image") {
      template.push(
        {
          label: "复制图片地址",
          click: () => {
            clipboard.writeText(params.srcURL);
          },
        },
        {
          label: "在外部浏览器中打开图片",
          click: () => {
            shell.openExternal(params.srcURL);
          },
        },
        { type: "separator" }
      );
    }

    // 如果有选中的文本
    if (params.selectionText) {
      template.push(
        {
          label: "复制",
          role: "copy",
        },
        { type: "separator" }
      );
    }

    // 通用菜单项
    template.push(
      {
        label: "返回",
        enabled: floatingWindow.webContents.navigationHistory.canGoBack(),
        click: () => {
          floatingWindow.webContents.navigationHistory.goBack();
        },
      },
      {
        label: "前进",
        enabled: floatingWindow.webContents.navigationHistory.canGoForward(),
        click: () => {
          floatingWindow.webContents.navigationHistory.goForward();
        },
      },
      {
        label: "刷新",
        click: () => {
          floatingWindow.webContents.reload();
        },
      },
      { type: "separator" },
      {
        label: "复制当前链接",
        click: () => {
          clipboard.writeText(floatingWindow.webContents.getURL());
        },
      },
      {
        label: "在外部浏览器中打开",
        click: () => {
          shell.openExternal(floatingWindow.webContents.getURL());
        },
      },
      { type: "separator" },
      {
        label: "检查元素",
        click: () => {
          floatingWindow.webContents.inspectElement(x, y);
        },
      },
      {
        label:"放大页面",
        role: "zoomIn",
      },
      {
        label: "缩小页面",
        role: "zoomOut",
      },
      {
        label: "开发者工具",
        accelerator: "CommandOrControl+Alt+I",
        click: () => {
          floatingWindow.webContents.toggleDevTools();
        },
      }
    );

    const contextMenu = Menu.buildFromTemplate(template);
    contextMenu.popup({
      window: floatingWindow,
      x: x,
      y: y,
    });
  });
}
