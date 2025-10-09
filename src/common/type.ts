import { BrowserItem } from "../main/electron/store";
export type IMainWindowFile = {
  useAppBase64: string;
  iconBase64: string;
  filePath: string;
  fileName: string;
  browser?: BrowserItem;
  lastAccessTime?: number;
};
export type IMainWindowFiles = IMainWindowFile[];

// Cookie 相关类型定义 - 新的基于URL的存储方式
export type SavedCookieByUrl = {
  id: string;
  url: string;
  domain: string;
  cookieString: string; // 完整的cookie字符串
  saveTime: number; // 保存时间戳
  saveTimeDisplay: string; // 格式化的保存时间
};

// 保持旧的类型定义用于兼容性
export type SavedCookie = {
  id: string;
  domain: string;
  name: string;
  value: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
  sameSite?: "unspecified" | "no_restriction" | "lax" | "strict";
  saveTime: number; // 保存时间戳
  saveTimeDisplay: string; // 格式化的保存时间
};

export type CookieData = {
  cookies: SavedCookie[];
};

// 保持旧的类型定义用于兼容性（如果需要的话）
export type NoteItem = {
  id: string;
  url: string;
  domain: string;
  title: string;
  content: string;
  createTime: number;
  updateTime: number;
  createTimeDisplay: string;
  updateTimeDisplay: string;
};

export type NotesData = {
  notes: NoteItem[];
};
