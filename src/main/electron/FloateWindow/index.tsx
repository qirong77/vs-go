import { BrowserWindow, Menu, shell, clipboard, session } from "electron";
import path from "path";
import { MainWindowManager } from "../MainWindow/MainWindow";
import { BrowserItem, vsgoStore } from "../store";
import { VS_GO_EVENT } from "../../../common/EVENT";
import { ipcMain } from "electron";
const floatingWindows: BrowserWindow[] = [];

const loadMonacoEditorString = `
const ELEMENT_ID = "monaco-markdown-editor";
const script = document.createElement("script");
script.src = "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs/loader.js";
script.onload = () => {
  window.require.config({
    paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs" },
  });
  window.require(["vs/editor/editor.main"], function () {
    const editor = window.monaco.editor.create(document.getElementById(ELEMENT_ID), {
      value: "# hello",
      language: "markdown",
      automaticLayout: true,
      minimap: { enabled: false },
    });
    window.electron.ipcRenderer.invoke("monaco-markdown-editor-get-content").then((content) => {
      editor.setValue(content);
      const debounce = (func, wait) => {
        let timeout;
        return (...args) => {
          clearTimeout(timeout);
          timeout = setTimeout(() => func(...args), wait);
        };
      };
      editor.onDidChangeModelContent(
        debounce(() => {
          const content = editor.getValue();
          window.electron.ipcRenderer.invoke("monaco-markdown-editor-content-changed", content);
        }, 500)
      );
    });
  });
};
document.body.appendChild(script);

`;
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  const responseHeaders = details.responseHeaders || {};
  // 处理 X-Frame-Options 头
  if (responseHeaders["x-frame-options"] || responseHeaders["X-Frame-Options"]) {
    delete responseHeaders["x-frame-options"];
    delete responseHeaders["X-Frame-Options"];
  }
  // 处理 Content-Security-Policy 头
  if (responseHeaders["content-security-policy"] || responseHeaders["Content-Security-Policy"]) {
    delete responseHeaders["content-security-policy"];
    delete responseHeaders["Content-Security-Policy"];
  }
  callback({ cancel: false, responseHeaders });
});
function createFloatingWindow(url = "https://www.baidu.com") {
  const oldWindow = floatingWindows.find(
    (win) => !win.isDestroyed() && win.webContents.getURL() === url
  );
  if (oldWindow) {
    if (!oldWindow.isVisible()) {
      oldWindow.showInactive();
    }
    return oldWindow;
  }
  const floatingWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    alwaysOnTop: false,
    webPreferences: {
      sandbox: false,
      preload: path.join(__dirname, "../preload/index.js"),
    },
  });

  floatingWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true, // 允许在全屏应用上显示
  });
  const isBookMarkUrl = (vsgoStore.get("browserList", []) as BrowserItem[]).some(
    (item) => item.url === url && item.type === "bookmark"
  );
  // floatingWindow.setAlwaysOnTop(true, "floating", 0);
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
  // 监听页面内导航事件
  floatingWindow.webContents.on("did-navigate-in-page", (_event, url) => {
    console.log("in-page navigated to:", url);
    const canGoBack = floatingWindow.webContents.navigationHistory.canGoBack();
    const canGoForward = floatingWindow.webContents.navigationHistory.canGoForward();
    floatingWindow.webContents.send("navigation-state-changed", { canGoBack, canGoForward, url });
  });

  // // 监听页面完全加载完成事件
  floatingWindow.webContents.on("did-finish-load", () => {
    const canGoBack = floatingWindow.webContents.navigationHistory.canGoBack();
    const canGoForward = floatingWindow.webContents.navigationHistory.canGoForward();
    floatingWindow.webContents.send("navigation-state-changed", { canGoBack, canGoForward, url });
    floatingWindow.webContents.executeJavaScript(loadMonacoEditorString);
  });

  // 监听普通导航事件
  floatingWindow.webContents.on("did-navigate", (_event, url) => {
    console.log("navigated to:", url);
    const canGoBack = floatingWindow.webContents.navigationHistory.canGoBack();
    const canGoForward = floatingWindow.webContents.navigationHistory.canGoForward();
    floatingWindow.webContents.send("navigation-state-changed", { canGoBack, canGoForward, url });
  });
  floatingWindow.loadURL(url);
  floatingWindows.push(floatingWindow);
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
        label: "开发者工具",
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

  // 处理新窗口请求，在外部浏览器中打开链接
  floatingWindow.webContents.setWindowOpenHandler(({ url: newUrl }) => {
    createFloatingWindow(newUrl);
    return { action: "deny" };
  });
  ipcMain.on(VS_GO_EVENT.FLOATING_WINDOW_TOGGLE_DEVTOOLS, (event) => {
    if (event.sender === floatingWindow.webContents) {
      floatingWindow.webContents.toggleDevTools();
    }
  });

  // 处理导航事件（后退、前进、刷新）
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
  floatingWindow.on("closed", () => {
    const index = floatingWindows.indexOf(floatingWindow);
    if (index > -1) {
      floatingWindows.splice(index, 1);
    }
  });

  floatingWindow.on("moved", () => {
    MainWindowManager.hide();
  });
  floatingWindow.center();
  floatingWindow.show();
  return floatingWindow;
}
function HideAllFloatingWindows() {
  floatingWindows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.hide();
    }
  });
}
function ShowAllFloatingWindows() {
  if (!floatingWindows.length) {
    createFloatingWindow("https://www.google.com");
    return;
  }
  floatingWindows.forEach((win) => {
    if (!win.isDestroyed() && !win.isVisible()) {
      win.showInactive();
    }
  });
  const lastWindow = floatingWindows[floatingWindows.length - 1];
  lastWindow.webContents.send(VS_GO_EVENT.FLOATING_WINDOW_FOCUS_INPUT);
  lastWindow.show();
}
function toggleFloatingWindowVisible() {
  const isVisible = floatingWindows.some((win) => !win.isDestroyed() && win?.isVisible());
  if (isVisible) {
    HideAllFloatingWindows();
  } else {
    ShowAllFloatingWindows();
  }
}
export const FloatingWindowManager = {
  createFloatingWindow,
  HideAllFloatingWindows,
  ShowAllFloatingWindows,
  toggleFloatingWindowVisible,
};
