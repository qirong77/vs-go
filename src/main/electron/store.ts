import Store from "electron-store";
import { SavedCookie } from "../../common/type";

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
};

const store = new Store({ schema });
export const vsgoStore = store;

// Cookie 存储相关方法
export const cookieStore = {
  getSavedCookies(): SavedCookie[] {
    return vsgoStore.get('savedCookies', []) as SavedCookie[];
  },
  
  saveCookie(cookie: SavedCookie): void {
    const cookies = this.getSavedCookies();
    cookies.push(cookie);
    vsgoStore.set('savedCookies', cookies);
  },
  
  deleteCookie(id: string): void {
    const cookies = this.getSavedCookies();
    const filteredCookies = cookies.filter(cookie => cookie.id !== id);
    vsgoStore.set('savedCookies', filteredCookies);
  },
  
  clearAllCookies(): void {
    vsgoStore.set('savedCookies', []);
  }
};
