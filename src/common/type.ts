import { BrowserItem } from "../main/electron/store";
export type IMainWindowFile = {
  useAppBase64: string;
  iconBase64: string;
  filePath: string;
  fileName: string;
  browser?: BrowserItem;
};
export type IMainWindowFiles = IMainWindowFile[];

// Cookie 相关类型定义
export type SavedCookie = {
  id: string;
  domain: string;
  name: string;
  value: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
  sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
  saveTime: number; // 保存时间戳
  saveTimeDisplay: string; // 格式化的保存时间
};

export type CookieData = {
  cookies: SavedCookie[];
};
