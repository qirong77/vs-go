// ============================================================
// 共享类型定义 - 所有跨进程 (main/renderer) 使用的类型
// ============================================================

// --- 编辑器 & App 设置 ---

export type DefaultEditor = "vscode" | "cursor";

export interface AppSettings {
  defaultEditor: DefaultEditor;
}

// --- 浏览器 / 书签 ---

export interface BrowserItem {
  id: string;
  name: string;
  url: string;
  lastVisit?: number;
  type: "bookmark" | "history";
}

// --- 浏览器历史 & 地址栏建议 ---

export interface BrowserHistoryEntry {
  id: string;
  url: string;
  title: string;
  visitTime: number;
}

export interface BrowserSuggestion {
  url: string;
  title: string;
  type: "bookmark" | "history";
}

// --- 主窗口文件列表 ---

export interface IMainWindowFile {
  useAppBase64: string;
  iconBase64: string;
  filePath: string;
  fileName: string;
  browser?: BrowserItem;
  lastAccessTime?: number;
}

export type IMainWindowFiles = IMainWindowFile[];

// --- Cookie ---

export interface SavedCookieByUrl {
  id: string;
  url: string;
  domain: string;
  cookieString: string;
  saveTime: number;
  saveTimeDisplay: string;
}

export interface SavedCookie {
  id: string;
  domain: string;
  name: string;
  value: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
  sameSite?: "unspecified" | "no_restriction" | "lax" | "strict";
  saveTime: number;
  saveTimeDisplay: string;
}

// --- 笔记 ---

export interface NoteTreeNode {
  key: string;
  title: string;
  isLeaf?: boolean;
  children?: NoteTreeNode[];
}

/** 单条笔记文件的历史快照（全量内容，每文件最多保留 10 条） */
export interface UserNoteHistoryEntry {
  id: string;
  savedAt: number;
  content: string;
}

/** 历史列表展示用（不含正文） */
export interface UserNoteHistoryMeta {
  id: string;
  savedAt: number;
}

export interface NoteItem {
  id: string;
  url: string;
  domain: string;
  title: string;
  content: string;
  createTime: number;
  updateTime: number;
  createTimeDisplay: string;
  updateTimeDisplay: string;
}

// --- IPC 响应通用类型 ---

export interface IpcResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

// --- Chrome 风格 Tabbed Browser 窗口 ---

/** Chrome 外壳 UI 总高度（标签栏 + 地址栏），main 与 renderer 共享 */
export const BROWSER_CHROME_HEIGHT = 72;

/** 新标签 / 空输入时的默认首页（与 main 中 load 逻辑保持一致） */
export const TABBED_BROWSER_DEFAULT_HOME_URL = "https://www.google.com";

/** 是否为默认首页 URL（仅用于地址栏展示为空，真实导航 URL 不变） */
export function isTabbedBrowserDefaultHomeUrl(url: string): boolean {
  try {
    const u = new URL((url || "").trim());
    const d = new URL(TABBED_BROWSER_DEFAULT_HOME_URL);
    const sameOrigin =
      u.protocol === d.protocol && u.hostname.toLowerCase() === d.hostname.toLowerCase();
    const rootPath = u.pathname === "/" || u.pathname === "";
    return sameOrigin && rootPath && !u.search && !u.hash;
  } catch {
    return false;
  }
}

/** 地址栏展示用：默认首页显示为空字符串 */
export function tabUrlForAddressBarDisplay(url: string): string {
  return isTabbedBrowserDefaultHomeUrl(url) ? "" : url;
}

export interface TabState {
  id: string;
  url: string;
  title: string;
  favicon: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface TabbedBrowserState {
  tabs: TabState[];
  activeTabId: string | null;
}
