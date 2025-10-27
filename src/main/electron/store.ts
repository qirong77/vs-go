import Store from "electron-store";
import { SavedCookie, SavedCookieByUrl } from "../../common/type";

// Define or import BrowserItem type
export type BrowserItem = {
  // Add appropriate fields here, for example:
  id: string;
  name: string;
  url: string;
  lastVisit?: number;
  type: "bookmark" | "history";
};

const schema = {
  browserList: {
    type: "array",
    default: [],
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        url: { type: "string" },
      },
    },
  },
  fileAccessHistory: {
    type: "object",
    default: {},
    additionalProperties: {
      type: "number",
    },
  },
  savedCookies: {
    type: "array",
    default: [],
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        domain: { type: "string" },
        name: { type: "string" },
        value: { type: "string" },
        path: { type: "string" },
        secure: { type: "boolean" },
        httpOnly: { type: "boolean" },
        expirationDate: { type: "number" },
        sameSite: { type: "string" },
        saveTime: { type: "number" },
        saveTimeDisplay: { type: "string" },
      },
    },
  },
  savedCookiesByUrl: {
    type: "array",
    default: [],
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        url: { type: "string" },
        domain: { type: "string" },
        cookieString: { type: "string" },
        saveTime: { type: "number" },
        saveTimeDisplay: { type: "string" },
      },
    },
  },
  savedNotes: {
    type: "array",
    default: [],
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        url: { type: "string" },
        domain: { type: "string" },
        title: { type: "string" },
        content: { type: "string" },
        createTime: { type: "number" },
        updateTime: { type: "number" },
        createTimeDisplay: { type: "string" },
        updateTimeDisplay: { type: "string" },
      },
    },
  },
  singleNote: {
    type: "object",
    default: {
      title: "",
      content: "",
      updateTime: 0,
      updateTimeDisplay: "",
    },
    properties: {
      title: { type: "string" },
      content: { type: "string" },
      updateTime: { type: "number" },
      updateTimeDisplay: { type: "string" },
    },
  },
  // Monaco编辑器笔记存储
  monacoNotes: {
    type: "object",
    default: {},
    additionalProperties: {
      type: "string",
    },
  },
};

const store = new Store({ schema });
export const vsgoStore = store;

// Cookie 存储相关方法
export const cookieStore = {
  getSavedCookies(): SavedCookie[] {
    return vsgoStore.get("savedCookies", []) as SavedCookie[];
  },

  saveCookie(cookie: SavedCookie): void {
    const cookies = this.getSavedCookies();
    cookies.push(cookie);
    vsgoStore.set("savedCookies", cookies);
  },

  deleteCookie(id: string): void {
    const cookies = this.getSavedCookies();
    const filteredCookies = cookies.filter((cookie) => cookie.id !== id);
    vsgoStore.set("savedCookies", filteredCookies);
  },

  clearAllCookies(): void {
    vsgoStore.set("savedCookies", []);
  },
};

// 新的基于URL的Cookie存储方法
export const cookieByUrlStore = {
  getSavedCookiesByUrl(): SavedCookieByUrl[] {
    return vsgoStore.get("savedCookiesByUrl", []) as SavedCookieByUrl[];
  },

  saveCookieByUrl(cookieData: SavedCookieByUrl): void {
    const cookies = this.getSavedCookiesByUrl();
    // 如果同一个URL已存在，则更新；否则添加新记录
    const existingIndex = cookies.findIndex((cookie) => cookie.url === cookieData.url);
    if (existingIndex >= 0) {
      cookies[existingIndex] = cookieData;
    } else {
      cookies.push(cookieData);
    }
    vsgoStore.set("savedCookiesByUrl", cookies);
  },

  deleteCookieByUrl(id: string): void {
    const cookies = this.getSavedCookiesByUrl();
    const filteredCookies = cookies.filter((cookie) => cookie.id !== id);
    vsgoStore.set("savedCookiesByUrl", filteredCookies);
  },

  getCookieByUrl(url: string): SavedCookieByUrl | undefined {
    const cookies = this.getSavedCookiesByUrl();
    return cookies.find((cookie) => cookie.url === url);
  },

  clearAllCookiesByUrl(): void {
    vsgoStore.set("savedCookiesByUrl", []);
  },
};

// 文件访问历史存储方法
export const fileAccessStore = {
  getFileAccessHistory(): Record<string, number> {
    return vsgoStore.get("fileAccessHistory", {}) as Record<string, number>;
  },

  updateFileAccessTime(filePath: string): void {
    const history = this.getFileAccessHistory();
    history[filePath] = Date.now();
    vsgoStore.set("fileAccessHistory", history);
  },

  getFileAccessTime(filePath: string): number | undefined {
    const history = this.getFileAccessHistory();
    return history[filePath];
  },

  clearFileAccessHistory(): void {
    vsgoStore.set("fileAccessHistory", {});
  },
};

// Monaco编辑器笔记存储方法
export const monacoNotesStore = {
  getMonacoNotes(): Record<string, string> {
    return vsgoStore.get("monacoNotes", {}) as Record<string, string>;
  },

  getMonacoNote(key: string): string {
    const notes = this.getMonacoNotes();
    return notes[key] || "";
  },

  saveMonacoNote(key: string, content: string): void {
    const notes = this.getMonacoNotes();
    notes[key] = content;
    vsgoStore.set("monacoNotes", notes);
  },

  deleteMonacoNote(key: string): void {
    const notes = this.getMonacoNotes();
    delete notes[key];
    vsgoStore.set("monacoNotes", notes);
  },

  clearAllMonacoNotes(): void {
    vsgoStore.set("monacoNotes", {});
  },
};
