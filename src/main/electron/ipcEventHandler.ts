import { VS_GO_EVENT } from "./../../common/EVENT";
import { dialog, ipcMain } from "electron";
import { openFileByVscode } from "../utils/openFileByVsCode";
import { is } from "@electron-toolkit/utils";
import { IMainWindowFile } from "../../common/type";
import { execSync } from "child_process";
import { getMainWindowFiles } from "./MainWindow/MainWindowFileManager";
import { existsSync, readFileSync } from "fs";
import { vscodeBase64 } from "../../common/vscodeBase64";
import { BrowserItem, vsgoStore } from "./store";
import { FloatingWindowManager } from "./FloateWindow";
import { MainWindowManager } from "./MainWindow/MainWindow";

// 解析书签HTML文件的函数
function parseBookmarksHtml(htmlContent: string): BrowserItem[] {
  const bookmarks: BrowserItem[] = [];

  // 使用正则表达式匹配所有的 <A> 标签
  const linkRegex = /<A[^>]*HREF="([^"]*)"[^>]*>([^<]*)<\/A>/gi;
  let match;

  while ((match = linkRegex.exec(htmlContent)) !== null) {
    const url = match[1];
    const name = match[2];

    // 过滤掉空的或无效的链接
    if (url && name && url.trim() && name.trim() && url.startsWith("http")) {
      bookmarks.push({
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        name: name.trim(),
        url: url.trim(),
      });
    }
  }

  return bookmarks;
}

ipcMain.on(VS_GO_EVENT.SET_SEARCH_WINDOW_HEIGHT, (_e, arg) => {
  !is.dev && MainWindowManager.setWindowSize(650, Math.floor(arg));
});
ipcMain.on(VS_GO_EVENT.OPEN_FILE, (_e, file: IMainWindowFile) => {
  MainWindowManager.hide();
  const filePath = file.filePath;
  if (!existsSync(filePath)) {
    dialog.showErrorBox("文件不存在", `${filePath} 不存在`);
    return;
  }
  // const isApp = file.filePath.includes('Applications')
  const isOpenFileByVsCode = file.useAppBase64 === vscodeBase64;
  if (isOpenFileByVsCode) {
    openFileByVscode(filePath);
    return;
  }
  const command = `open -R ${file.filePath}`;
  execSync(command);
  return;
});
ipcMain.handle(VS_GO_EVENT.GET_FILES_LIST, async () => {
  const res = await getMainWindowFiles();
  return res;
});

ipcMain.handle(VS_GO_EVENT.BROWSER_LIST, async () => {
  const browserList = vsgoStore.get("browserList", []) as BrowserItem[];
  return browserList;
});
ipcMain.handle(VS_GO_EVENT.BROWSER_ADD, async (_event, arg) => {
  const browserList = vsgoStore.get("browserList", []) as BrowserItem[];
  browserList.push(arg);
  vsgoStore.set("browserList", browserList);
  return browserList;
});
ipcMain.handle(VS_GO_EVENT.BROWSER_REMOVE, async (_event, id) => {
  const browserList = vsgoStore.get("browserList", []) as BrowserItem[];
  const index = browserList.findIndex((item) => item.id == id);
  console.log(index);
  if (index !== -1) {
    browserList.splice(index, 1);
    vsgoStore.set("browserList", browserList);
  }
  return browserList;
});
ipcMain.handle(VS_GO_EVENT.BROWSER_REMOVE_ALL, async () => {
  vsgoStore.set("browserList", []);
  return [];
});
ipcMain.handle(VS_GO_EVENT.BROWSER_UPDATE, async (_event, arg) => {
  const browserList = vsgoStore.get("browserList", []) as BrowserItem[];
  const index = browserList.findIndex((item) => item.id == arg.id);
  if (index !== -1) {
    browserList[index] = arg;
    vsgoStore.set("browserList", browserList);
  }
  return browserList;
});

ipcMain.on(VS_GO_EVENT.CREATE_FLOATING_WINDOW, (_e, arg: BrowserItem) => {
  FloatingWindowManager.createFloatingWindow(arg.url);
  MainWindowManager.hide();
});

// 选择书签文件
ipcMain.handle(VS_GO_EVENT.BROWSER_IMPORT_SELECT_FILE, async () => {
  MainWindowManager.hide();
  FloatingWindowManager.HideAllFloatingWindows();
  const result = await dialog.showOpenDialog({
    title: "选择书签文件",
    filters: [
      { name: "书签文件", extensions: ["html", "htm"] },
      { name: "所有文件", extensions: ["*"] },
    ],
    properties: ["openFile"],
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  const filePath = result.filePaths[0];

  try {
    const htmlContent = readFileSync(filePath, "utf-8");
    const bookmarks = parseBookmarksHtml(htmlContent);
    return bookmarks;
  } catch (error) {
    console.error("解析书签文件失败:", error);
    throw new Error("解析书签文件失败，请确保文件格式正确");
  }
});

// 导入选中的书签
ipcMain.handle(VS_GO_EVENT.BROWSER_IMPORT_BOOKMARKS, async (_event, bookmarks: BrowserItem[]) => {
  const browserList = vsgoStore.get("browserList", []) as BrowserItem[];

  // 过滤掉重复的书签（基于URL）
  const existingUrls = new Set(browserList.map((item) => item.url));
  const newBookmarks = bookmarks.filter((bookmark) => !existingUrls.has(bookmark.url));

  // 添加新书签
  const updatedList = [...browserList, ...newBookmarks];
  vsgoStore.set("browserList", updatedList);

  return {
    imported: newBookmarks.length,
    duplicate: bookmarks.length - newBookmarks.length,
    total: updatedList.length,
  };
});
