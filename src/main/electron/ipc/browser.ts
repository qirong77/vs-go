import { BrowserWindow, ipcMain } from "electron";
import { VS_GO_EVENT } from "../../../common/EVENT";
import type { BrowserItem, BrowserSuggestion } from "../../../common/type";
import { vsgoStore, fileAccessStore, browserHistoryStore } from "../store";
import { TabbedBrowserWindowManager } from "../BrowserWindow/TabbedBrowserWindowManager";
import { MainWindowManager } from "../MainWindow/MainWindow";

export function registerBrowserHandlers(): void {
  ipcMain.handle(VS_GO_EVENT.BROWSER_LIST, async () => {
    return vsgoStore.get("browserList", []) as BrowserItem[];
  });

  ipcMain.handle(VS_GO_EVENT.BROWSER_ADD, async (_event, item: BrowserItem) => {
    const list = vsgoStore.get("browserList", []) as BrowserItem[];
    const siblings = list.filter((i) => (i.parentId ?? null) === (item.parentId ?? null));
    const maxOrder = siblings.reduce((max, i) => Math.max(max, i.order ?? 0), -1);
    item.order = maxOrder + 1;
    list.push(item);
    vsgoStore.set("browserList", list);
    return list;
  });

  ipcMain.handle(VS_GO_EVENT.BROWSER_REMOVE, async (_event, id: string) => {
    const list = vsgoStore.get("browserList", []) as BrowserItem[];
    const target = list.find((item) => item.id === id);
    if (!target) return list;

    const idsToRemove = new Set<string>([id]);
    if (target.type === "folder") {
      const collect = (parent: string): void => {
        for (const x of list) {
          if ((x.parentId ?? null) === parent) {
            idsToRemove.add(x.id);
            if (x.type === "folder") collect(x.id);
          }
        }
      };
      collect(id);
    }

    const next = list.filter((item) => !idsToRemove.has(item.id));
    vsgoStore.set("browserList", next);
    return next;
  });

  ipcMain.handle(VS_GO_EVENT.BROWSER_REORDER, async (_event, payload: { id: string; order: number; parentId?: string | null }) => {
    const list = vsgoStore.get("browserList", []) as BrowserItem[];
    const idx = list.findIndex((i) => i.id === payload.id);
    if (idx !== -1) {
      list[idx].order = payload.order;
      if (payload.parentId !== undefined) {
        list[idx].parentId = payload.parentId;
      }
      vsgoStore.set("browserList", list);
    }
    return list;
  });

  ipcMain.handle(VS_GO_EVENT.BROWSER_REMOVE_ALL, async () => {
    vsgoStore.set("browserList", []);
    return [];
  });

  ipcMain.handle(VS_GO_EVENT.BROWSER_UPDATE, async (_event, item: BrowserItem) => {
    const list = vsgoStore.get("browserList", []) as BrowserItem[];
    const index = list.findIndex((i) => i.id === item.id);
    if (index !== -1) {
      list[index] = item;
      vsgoStore.set("browserList", list);
    }
    return list;
  });

  ipcMain.on(VS_GO_EVENT.FLOATING_WINDOW_CREATE, (_e, item: BrowserItem) => {
    const url = item.url;
    if (!url) return;
    fileAccessStore.updateAccessTime(url);
    TabbedBrowserWindowManager.openUrl(url);
    MainWindowManager.hide();
  });

  ipcMain.on(VS_GO_EVENT.BROWSER_CHROME_SET_PADDING, (e, extraHeight: number) => {
    const bw = BrowserWindow.fromWebContents(e.sender);
    if (bw) {
      TabbedBrowserWindowManager.setChromePadding(bw.id, extraHeight);
    }
  });

  ipcMain.handle(VS_GO_EVENT.BROWSER_ADDRESS_SUGGESTIONS, async (_e, query: string = "") => {
    const bookmarks = vsgoStore.get("browserList", []) as BrowserItem[];
    const history = browserHistoryStore.getAll();
    const q = query.toLowerCase().trim();

    const suggestions: BrowserSuggestion[] = [];
    const seenUrls = new Set<string>();

    const bookmarkEntries = bookmarks.filter(
      (b): b is BrowserItem & { url: string } =>
        (b.type === "bookmark" || b.type === "history") && !!b.url
    );

    const matchBookmarks = q
      ? bookmarkEntries.filter(
          (b) => b.name.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
        )
      : bookmarkEntries.slice(0, 8);

    for (const b of matchBookmarks) {
      suggestions.push({ url: b.url, title: b.name, type: "bookmark" });
      seenUrls.add(b.url);
    }

    const matchHistory = q
      ? history.filter(
          (h) => h.title.toLowerCase().includes(q) || h.url.toLowerCase().includes(q)
        )
      : history.slice(0, 8);

    for (const h of matchHistory) {
      if (!seenUrls.has(h.url)) {
        suggestions.push({ url: h.url, title: h.title, type: "history" });
        seenUrls.add(h.url);
      }
    }

    return suggestions.slice(0, 12);
  });

  ipcMain.handle(
    VS_GO_EVENT.FLOATING_WINDOW_SEARCH_URL,
    async (_event, searchWord = "") => {
      const list = vsgoStore.get("browserList", []) as BrowserItem[];
      if (!searchWord) return list;

      return list
        .filter(
          (item) =>
            (item.type === "bookmark" || item.type === "history") &&
            !!item.url &&
            item.name.toLowerCase().includes(searchWord.toLowerCase())
        )
        .sort((a, b) => {
          const aScore = 100 - (a.name.toLowerCase().indexOf(searchWord.toLowerCase()) + 1);
          const bScore = 100 - (b.name.toLowerCase().indexOf(searchWord.toLowerCase()) + 1);
          return bScore - aScore;
        });
    }
  );
}
