import Store from "electron-store";
import type { SavedCookie, SavedCookieByUrl } from "@shared/type";

const schema = {
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
} as const;

const store = new Store({ schema });

export const cookieStore = {
  getSavedCookies(): SavedCookie[] {
    return store.get("savedCookies", []) as SavedCookie[];
  },
  saveCookie(cookie: SavedCookie): void {
    const cookies = this.getSavedCookies();
    cookies.push(cookie);
    store.set("savedCookies", cookies);
  },
  deleteCookie(id: string): void {
    const filtered = this.getSavedCookies().filter((c) => c.id !== id);
    store.set("savedCookies", filtered);
  },
};

export const cookieByUrlStore = {
  getAll(): SavedCookieByUrl[] {
    return store.get("savedCookiesByUrl", []) as SavedCookieByUrl[];
  },
  save(cookieData: SavedCookieByUrl): void {
    const cookies = this.getAll();
    const existingIndex = cookies.findIndex((c) => c.domain === cookieData.domain);
    if (existingIndex >= 0) {
      cookies[existingIndex] = cookieData;
    } else {
      cookies.push(cookieData);
    }
    store.set("savedCookiesByUrl", cookies);
  },
  delete(id: string): void {
    const filtered = this.getAll().filter((c) => c.id !== id);
    store.set("savedCookiesByUrl", filtered);
  },
  getByUrl(url: string): SavedCookieByUrl | undefined {
    return this.getAll().find((c) => c.url === url);
  },
};
