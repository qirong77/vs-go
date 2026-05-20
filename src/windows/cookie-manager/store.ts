import type { SavedCookie, SavedCookieByUrl } from "@shared/type";
import { vsgoStore } from "@platform/store/instance";

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
    const filtered = this.getSavedCookies().filter((c) => c.id !== id);
    vsgoStore.set("savedCookies", filtered);
  },
};

export const cookieByUrlStore = {
  getAll(): SavedCookieByUrl[] {
    return vsgoStore.get("savedCookiesByUrl", []) as SavedCookieByUrl[];
  },
  save(cookieData: SavedCookieByUrl): void {
    const cookies = this.getAll();
    const existingIndex = cookies.findIndex((c) => c.domain === cookieData.domain);
    if (existingIndex >= 0) {
      cookies[existingIndex] = cookieData;
    } else {
      cookies.push(cookieData);
    }
    vsgoStore.set("savedCookiesByUrl", cookies);
  },
  delete(id: string): void {
    const filtered = this.getAll().filter((c) => c.id !== id);
    vsgoStore.set("savedCookiesByUrl", filtered);
  },
  getByUrl(url: string): SavedCookieByUrl | undefined {
    return this.getAll().find((c) => c.url === url);
  },
};
