import Store from "electron-store";
import { SavedCookie, SavedCookieByUrl, NoteItem, SingleNote } from "../../common/type";

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

// 笔记存储相关方法
export const noteStore = {
  getAllNotes(): NoteItem[] {
    return vsgoStore.get("savedNotes", []) as NoteItem[];
  },

  getNoteByUrl(url: string): NoteItem | undefined {
    const notes = this.getAllNotes();
    return notes.find((note) => note.url === url);
  },

  saveNote(note: NoteItem): void {
    const notes = this.getAllNotes();
    const existingIndex = notes.findIndex((n) => n.url === note.url);

    if (existingIndex >= 0) {
      notes[existingIndex] = note;
    } else {
      notes.push(note);
    }

    vsgoStore.set("savedNotes", notes);
  },

  deleteNote(id: string): void {
    const notes = this.getAllNotes();
    const filteredNotes = notes.filter((note) => note.id !== id);
    vsgoStore.set("savedNotes", filteredNotes);
  },

  searchNotes(query: string): NoteItem[] {
    const notes = this.getAllNotes();
    const lowerQuery = query.toLowerCase();

    return notes.filter(
      (note) =>
        note.title.toLowerCase().includes(lowerQuery) ||
        note.domain.toLowerCase().includes(lowerQuery) ||
        note.content.toLowerCase().includes(lowerQuery)
    );
  },

  clearAllNotes(): void {
    vsgoStore.set("savedNotes", []);
  },
};

// 新的单个笔记存储方法
export const singleNoteStore = {
  getNote(): SingleNote {
    return vsgoStore.get("singleNote") as SingleNote;
  },

  saveNote(note: SingleNote): void {
    vsgoStore.set("singleNote", note);
  },

  clearNote(): void {
    const emptyNote: SingleNote = {
      title: "",
      content: "",
      updateTime: 0,
      updateTimeDisplay: "",
    };
    vsgoStore.set("singleNote", emptyNote);
  },
};
