import { VS_GO_EVENT } from "./../../common/EVENT";
import { dialog, ipcMain, session } from "electron";
import { openFileByVscode } from "../utils/openFileByVsCode";
import { is } from "@electron-toolkit/utils";
import { IMainWindowFile } from "../../common/type";
import { execSync } from "child_process";
import { getMainWindowFiles } from "./MainWindow/MainWindowFileManager";
import { existsSync, readFileSync } from "fs";
import { vscodeBase64 } from "../../common/vscodeBase64";
import { BrowserItem, vsgoStore, cookieStore, cookieByUrlStore, singleNoteStore } from "./store";
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
        type: "bookmark",
      });
    }
  }

  return bookmarks;
}

ipcMain.on(VS_GO_EVENT.SET_SEARCH_WINDOW_HEIGHT, (_e, arg) => {
  !is.dev && MainWindowManager.setWindowSize(650, Math.floor(arg));
});
ipcMain.on(VS_GO_EVENT.OPEN_FILE, (_e, file: IMainWindowFile) => {
  const filePath = file.filePath;
  if (!existsSync(filePath)) {
    dialog.showErrorBox("文件不存在", `${filePath} 不存在`);
    return;
  }
  const isApp = file.filePath.includes("Applications");
  if (isApp) {
    const command = `open ${file.filePath}`;
    execSync(command);
    MainWindowManager.hide();
    return;
  }
  const isOpenFileByVsCode = file.useAppBase64 === vscodeBase64;
  if (isOpenFileByVsCode) {
    MainWindowManager.hide();
    openFileByVscode(filePath);
    return;
  }
  const command = `open -R ${file.filePath}`;
  execSync(command);
  MainWindowManager.hide();
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
ipcMain.handle(VS_GO_EVENT.BROWSER_REMOVE, async (_event, url) => {
  const browserList = vsgoStore.get("browserList", []) as BrowserItem[];
  const index = browserList.findIndex((item) => item.url == url);
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

ipcMain.on(VS_GO_EVENT.FLOATING_WINDOW_CREATE, (_e, arg: BrowserItem) => {
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

ipcMain.handle(VS_GO_EVENT.FLOATING_WINDOW_SEARCH_URL, async (_event, searchWord = "") => {
  const browserList = vsgoStore.get("browserList", []) as BrowserItem[];
  if (!searchWord) {
    return browserList;
  }
  const filteredList = browserList
    .filter((item) => item.name.toLowerCase().includes(searchWord.toLowerCase()))
    .sort((f1, f2) => {
      const f1Score = 100 - (f1.name.toLowerCase().indexOf(searchWord.toLowerCase()) + 1);
      const f2Score = 100 - (f2.name.toLowerCase().indexOf(searchWord.toLowerCase()) + 1);
      return f2Score - f1Score;
    });
  return filteredList;
});

// Cookie 相关事件处理
ipcMain.handle(VS_GO_EVENT.COOKIE_GET_CURRENT, async (_event, url: string) => {
  try {
    const cookies = await session.defaultSession.cookies.get({ url });
    return cookies;
  } catch (error) {
    console.error('获取当前页面 Cookie 失败:', error);
    return [];
  }
});

ipcMain.handle(VS_GO_EVENT.COOKIE_SAVE, async (_event, cookieData) => {
  try {

    const now = new Date();
    const savedCookie = {
      ...cookieData,
      id: Math.random().toString(36).slice(2) + Date.now().toString(36),
      saveTime: now.getTime(),
      saveTimeDisplay: now.toLocaleString('zh-CN'),
    };
    cookieStore.saveCookie(savedCookie);
    return { success: true, cookie: savedCookie };
  } catch (error) {
    console.error('保存 Cookie 失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '未知错误' };
  }
});

ipcMain.handle(VS_GO_EVENT.COOKIE_GET_SAVED_LIST, async () => {
  try {
    return cookieStore.getSavedCookies();
  } catch (error) {
    console.error('获取已保存 Cookie 列表失败:', error);
    return [];
  }
});

ipcMain.handle(VS_GO_EVENT.COOKIE_DELETE, async (_event, cookieId: string) => {
  try {
    cookieStore.deleteCookie(cookieId);
    return { success: true };
  } catch (error) {
    console.error('删除 Cookie 失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '未知错误' };
  }
});

ipcMain.handle(VS_GO_EVENT.COOKIE_APPLY, async (_event, cookie, targetUrl: string) => {
  try {
    const { session } = require('electron');
    const cookieDetails = {
      url: targetUrl,
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || '/',
      secure: cookie.secure || false,
      httpOnly: cookie.httpOnly || false,
      expirationDate: cookie.expirationDate,
      sameSite: cookie.sameSite || 'unspecified'
    };
    
    await session.defaultSession.cookies.set(cookieDetails);
    return { success: true };
  } catch (error) {
    console.error('应用 Cookie 失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '未知错误' };
  }
});

// 新的基于URL的Cookie事件处理
ipcMain.handle(VS_GO_EVENT.COOKIE_SAVE_BY_URL, async (_event, url: string) => {
  try {
    // 获取当前页面的所有cookie
    const cookies = await session.defaultSession.cookies.get({ url });
    
    if (cookies.length === 0) {
      return { success: false, error: '当前页面没有cookie可保存' };
    }
    
    // 将cookie转换为字符串格式
    const cookieString = cookies.map(cookie => {
      let cookieStr = `${cookie.name}=${cookie.value}`;
      if (cookie.domain) cookieStr += `; Domain=${cookie.domain}`;
      if (cookie.path) cookieStr += `; Path=${cookie.path}`;
      if (cookie.secure) cookieStr += `; Secure`;
      if (cookie.httpOnly) cookieStr += `; HttpOnly`;
      if (cookie.expirationDate) {
        const expiryDate = new Date(cookie.expirationDate * 1000);
        cookieStr += `; Expires=${expiryDate.toUTCString()}`;
      }
      if (cookie.sameSite) cookieStr += `; SameSite=${cookie.sameSite}`;
      return cookieStr;
    }).join('; ');
    
    const now = new Date();
    const domain = new URL(url).hostname;
    const savedCookie = {
      id: Math.random().toString(36).slice(2) + Date.now().toString(36),
      url,
      domain,
      cookieString,
      saveTime: now.getTime(),
      saveTimeDisplay: now.toLocaleString('zh-CN'),
    };
    
    cookieByUrlStore.saveCookieByUrl(savedCookie);
    return { success: true, cookie: savedCookie };
  } catch (error) {
    console.error('保存Cookie失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '未知错误' };
  }
});

ipcMain.handle(VS_GO_EVENT.COOKIE_GET_SAVED_LIST_BY_URL, async () => {
  try {
    return cookieByUrlStore.getSavedCookiesByUrl();
  } catch (error) {
    console.error('获取已保存Cookie列表失败:', error);
    return [];
  }
});

ipcMain.handle(VS_GO_EVENT.COOKIE_DELETE_BY_URL, async (_event, cookieId: string) => {
  try {
    cookieByUrlStore.deleteCookieByUrl(cookieId);
    return { success: true };
  } catch (error) {
    console.error('删除Cookie失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '未知错误' };
  }
});

ipcMain.handle(VS_GO_EVENT.COOKIE_APPLY_BY_URL, async (_event, cookieData, targetUrl: string) => {
  try {
    // 解析cookie字符串并应用到目标URL
    const cookieEntries = cookieData.cookieString.split('; ');
    const cookiesToSet: any[] = [];
    
    for (const entry of cookieEntries) {
      if (!entry.includes('=')) continue;
      
      const [nameValue, ...attributes] = entry.split(';');
      const [name, value] = nameValue.split('=');
      
      if (!name || value === undefined) continue;
      
      const cookieDetails: any = {
        url: targetUrl,
        name: name.trim(),
        value: value.trim(),
        domain: new URL(targetUrl).hostname,
        path: '/',
        secure: false,
        httpOnly: false,
        sameSite: 'unspecified'
      };
      
      // 解析属性
      for (const attr of attributes) {
        const attrTrimmed = attr.trim();
        if (attrTrimmed.toLowerCase().startsWith('domain=')) {
          cookieDetails.domain = attrTrimmed.substring(7);
        } else if (attrTrimmed.toLowerCase().startsWith('path=')) {
          cookieDetails.path = attrTrimmed.substring(5);
        } else if (attrTrimmed.toLowerCase() === 'secure') {
          cookieDetails.secure = true;
        } else if (attrTrimmed.toLowerCase() === 'httponly') {
          cookieDetails.httpOnly = true;
        } else if (attrTrimmed.toLowerCase().startsWith('expires=')) {
          const expiryStr = attrTrimmed.substring(8);
          const expiryDate = new Date(expiryStr);
          if (!isNaN(expiryDate.getTime())) {
            cookieDetails.expirationDate = expiryDate.getTime() / 1000;
          }
        } else if (attrTrimmed.toLowerCase().startsWith('samesite=')) {
          const sameSiteValue = attrTrimmed.substring(9).toLowerCase();
          if (['unspecified', 'no_restriction', 'lax', 'strict'].includes(sameSiteValue)) {
            cookieDetails.sameSite = sameSiteValue;
          }
        }
      }
      
      cookiesToSet.push(cookieDetails);
    }
    
    // 设置所有cookie
    for (const cookieDetails of cookiesToSet) {
      await session.defaultSession.cookies.set(cookieDetails);
    }
    
    return { success: true, count: cookiesToSet.length };
  } catch (error) {
    console.error('应用Cookie失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '未知错误' };
  }
});

// 笔记相关事件处理
ipcMain.handle(VS_GO_EVENT.NOTE_GET_BY_URL, async (_event, url: string) => {
  try {
    const { noteStore } = await import('./store');
    return noteStore.getNoteByUrl(url);
  } catch (error) {
    console.error('获取笔记失败:', error);
    return null;
  }
});

ipcMain.handle(VS_GO_EVENT.NOTE_SAVE, async (_event, noteData) => {
  try {
    const { noteStore } = await import('./store');
    const now = new Date();
    const isUpdate = noteData.id && noteData.createTime;
    
    const note = {
      ...noteData,
      id: noteData.id || Math.random().toString(36).slice(2) + Date.now().toString(36),
      createTime: noteData.createTime || now.getTime(),
      updateTime: now.getTime(),
      createTimeDisplay: noteData.createTimeDisplay || now.toLocaleString('zh-CN'),
      updateTimeDisplay: now.toLocaleString('zh-CN'),
    };
    
    noteStore.saveNote(note);
    return { success: true, note, isUpdate };
  } catch (error) {
    console.error('保存笔记失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '未知错误' };
  }
});

ipcMain.handle(VS_GO_EVENT.NOTE_GET_ALL, async () => {
  try {
    const { noteStore } = await import('./store');
    return noteStore.getAllNotes();
  } catch (error) {
    console.error('获取所有笔记失败:', error);
    return [];
  }
});

ipcMain.handle(VS_GO_EVENT.NOTE_DELETE, async (_event, noteId: string) => {
  try {
    const { noteStore } = await import('./store');
    noteStore.deleteNote(noteId);
    return { success: true };
  } catch (error) {
    console.error('删除笔记失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '未知错误' };
  }
});

ipcMain.handle(VS_GO_EVENT.NOTE_SEARCH, async (_event, query: string) => {
  try {
    const { noteStore } = await import('./store');
    return noteStore.searchNotes(query);
  } catch (error) {
    console.error('搜索笔记失败:', error);
    return [];
  }
});

// 新的单个笔记事件处理
ipcMain.handle(VS_GO_EVENT.SINGLE_NOTE_GET, async () => {
  try {
    return singleNoteStore.getNote();
  } catch (error) {
    console.error('获取笔记失败:', error);
    return { title: "", content: "", updateTime: 0, updateTimeDisplay: "" };
  }
});

ipcMain.handle(VS_GO_EVENT.SINGLE_NOTE_SAVE, async (_event, noteData) => {
  try {
    const now = new Date();
    const note = {
      title: noteData.title || "",
      content: noteData.content || "",
      updateTime: now.getTime(),
      updateTimeDisplay: now.toLocaleString('zh-CN'),
    };
    
    singleNoteStore.saveNote(note);
    return { success: true, note };
  } catch (error) {
    console.error('保存笔记失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '未知错误' };
  }
});

ipcMain.handle(VS_GO_EVENT.SINGLE_NOTE_CLEAR, async () => {
  try {
    singleNoteStore.clearNote();
    return { success: true };
  } catch (error) {
    console.error('清空笔记失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '未知错误' };
  }
});
