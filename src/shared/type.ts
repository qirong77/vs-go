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
  /** 书签条目必填；文件夹可不存 */
  url?: string;
  lastVisit?: number;
  type: "bookmark" | "folder";
  /** 书签栏根为 null；旧数据缺省视为 null */
  parentId?: string | null;
  /** 同级内的排序序号，用于拖动排序 */
  order?: number;
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

// --- Chrome 风格 Tabbed Browser 窗口 ---

/** Chrome 外壳 UI 总高度（标签栏 + 地址栏 + 书签栏 + 书签栏底边距），main 与 renderer 共享 */
export const BROWSER_CHROME_HEIGHT = 106;

/** 笔记窗口 / 浏览器默认首页：语雀文档 */
export const USER_NOTES_YUQUE_URL =
  "https://www.yuque.com/qirong-work/fhc6ot/pdqwm8c5gwvi117d";

/** 新标签 / 空输入时的默认首页（与 main 中 load 逻辑保持一致） */
export const TABBED_BROWSER_DEFAULT_HOME_URL = USER_NOTES_YUQUE_URL;

function normalizeUrlForHomeCompare(url: string): string {
  try {
    const u = new URL(url.trim());
    const pathname = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol}//${u.host.toLowerCase()}${pathname}${u.search}`;
  } catch {
    return url.trim();
  }
}

/** 是否为默认首页 URL（仅用于地址栏展示为空，真实导航 URL 不变） */
export function isTabbedBrowserDefaultHomeUrl(url: string): boolean {
  const trimmed = (url || "").trim();
  if (!trimmed) return false;
  return (
    normalizeUrlForHomeCompare(trimmed) ===
    normalizeUrlForHomeCompare(TABBED_BROWSER_DEFAULT_HOME_URL)
  );
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

// --- 浮动覆盖层窗口 ---

export type OverlayType =
  | "bookmark-star"
  | "folder-dropdown"
  | "context-menu"
  | "name-dialog";

export interface OverlayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayShowPayload {
  type: OverlayType;
  bounds: OverlayBounds;
  data: unknown;
}

export interface OverlayContentPayload {
  type: OverlayType;
  data: unknown;
}

export interface OverlayActionPayload {
  type: string;
  [key: string]: unknown;
}

/** 浮动窗口为 box-shadow 预留的外扩边距（窗口比内容大，阴影才不会被裁切） */
export const OVERLAY_SHADOW_INSET = {
  horizontal: 6,
  bottom: 10,
  top: 4,
} as const;

export interface OverlayContentInset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function getOverlayContentInset(_type: OverlayType): OverlayContentInset {
  const { horizontal, bottom, top } = OVERLAY_SHADOW_INSET;
  return { top, right: horizontal, bottom, left: horizontal };
}

/** 根据内容区域计算 Electron 浮动窗口实际 bounds */
export function getOverlayWindowBounds(
  contentBounds: OverlayBounds,
  type: OverlayType
): OverlayBounds {
  const inset = getOverlayContentInset(type);
  return {
    x: contentBounds.x - inset.left,
    y: contentBounds.y - inset.top,
    width: contentBounds.width + inset.left + inset.right,
    height: contentBounds.height + inset.top + inset.bottom,
  };
}
