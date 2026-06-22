import Store from "electron-store";
import type { BrowserHistoryItem, BrowserItem } from "@shared/type";

const MAX_HISTORY_ITEMS = 100;

const schema = {
  browserList: {
    type: "array",
    default: [],
    items: {
      type: "object",
      additionalProperties: true,
    },
  },
  browserHistory: {
    type: "array",
    default: [],
    items: {
      type: "object",
      additionalProperties: true,
    },
  },
} as const;

const store = new Store({ schema });

export const browserStore = {
  getList(): BrowserItem[] {
    return store.get("browserList", []) as BrowserItem[];
  },
  setList(list: BrowserItem[]): void {
    store.set("browserList", list);
  },
  getHistory(): BrowserHistoryItem[] {
    return store.get("browserHistory", []) as BrowserHistoryItem[];
  },
  addHistory(input: { url: string; title?: string; favicon?: string }): BrowserHistoryItem[] {
    const url = input.url.trim();
    if (!url || url === "about:blank") return this.getHistory();

    const now = Date.now();
    const list = this.getHistory();
    const existing = list.find((item) => item.url === url);
    const title = input.title?.trim() || existing?.title || url;
    const favicon = input.favicon || existing?.favicon || "";

    const nextItem: BrowserHistoryItem = {
      id: existing?.id || `history_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      url,
      favicon,
      lastVisit: now,
      visitCount: (existing?.visitCount ?? 0) + 1,
    };

    const next = [nextItem, ...list.filter((item) => item.url !== url)].slice(0, MAX_HISTORY_ITEMS);
    store.set("browserHistory", next);
    return next;
  },
  updateHistoryMetadata(input: {
    url: string;
    title?: string;
    favicon?: string;
  }): BrowserHistoryItem[] {
    const url = input.url.trim();
    if (!url || url === "about:blank") return this.getHistory();

    const title = input.title?.trim();
    const favicon = input.favicon?.trim();
    if (!title && !favicon) return this.getHistory();

    let changed = false;
    const next = this.getHistory().map((item) => {
      if (item.url !== url) return item;
      const updated: BrowserHistoryItem = { ...item };
      if (title && title !== item.title) {
        updated.title = title;
        changed = true;
      }
      if (favicon && favicon !== item.favicon) {
        updated.favicon = favicon;
        changed = true;
      }
      return updated;
    });

    if (changed) store.set("browserHistory", next);
    return next;
  },
};
