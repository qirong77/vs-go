import type { BrowserHistoryEntry } from "@shared/type";
import { generateId } from "@shared/utils";
import { vsgoStore } from "@platform/store/instance";

export { vsgoStore };

const MAX_BROWSER_HISTORY = 200;

export const browserHistoryStore = {
  getAll(): BrowserHistoryEntry[] {
    return vsgoStore.get("browserHistory", []) as BrowserHistoryEntry[];
  },
  add(url: string, title: string): void {
    if (!url || /^(about:|chrome:|devtools:|file:)/.test(url)) return;
    const list = this.getAll().filter((e) => e.url !== url);
    list.unshift({ id: generateId("bh"), url, title: title || url, visitTime: Date.now() });
    vsgoStore.set("browserHistory", list.slice(0, MAX_BROWSER_HISTORY));
  },
  clearAll(): void {
    vsgoStore.set("browserHistory", []);
  },
};
