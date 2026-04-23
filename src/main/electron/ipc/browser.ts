import { BrowserWindow, dialog, ipcMain } from "electron";
import { readFileSync } from "node:fs";
import { VS_GO_EVENT } from "../../../common/EVENT";
import type { BrowserItem, BrowserSuggestion } from "../../../common/type";
import { generateId } from "../../../common/utils";
import { vsgoStore, fileAccessStore, browserHistoryStore } from "../store";
import { TabbedBrowserWindowManager } from "../BrowserWindow/TabbedBrowserWindowManager";
import { MainWindowManager } from "../MainWindow/MainWindow";

function parseBookmarksHtml(htmlContent: string): BrowserItem[] {
  const bookmarks: BrowserItem[] = [];
  const linkRegex = /<A[^>]*HREF="([^"]*)"[^>]*>([^<]*)<\/A>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(htmlContent)) !== null) {
    const url = match[1];
    const name = match[2];

    if (url?.trim() && name?.trim() && url.startsWith("http")) {
      bookmarks.push({
        id: generateId(),
        name: name.trim(),
        url: url.trim(),
        type: "bookmark",
      });
    }
  }

  return bookmarks;
}

export function registerBrowserHandlers(): void {
  ipcMain.handle(VS_GO_EVENT.BROWSER_LIST, async () => {
    return vsgoStore.get("browserList", []) as BrowserItem[];
  });

  ipcMain.handle(VS_GO_EVENT.BROWSER_ADD, async (_event, item: BrowserItem) => {
    const list = vsgoStore.get("browserList", []) as BrowserItem[];
    list.push(item);
    vsgoStore.set("browserList", list);
    return list;
  });

  ipcMain.handle(VS_GO_EVENT.BROWSER_REMOVE, async (_event, url: string) => {
    const list = vsgoStore.get("browserList", []) as BrowserItem[];
    const index = list.findIndex((item) => item.url === url);
    if (index !== -1) {
      list.splice(index, 1);
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
    fileAccessStore.updateAccessTime(item.url);
    TabbedBrowserWindowManager.openUrl(item.url);
    MainWindowManager.hide();
  });

  ipcMain.handle(VS_GO_EVENT.BROWSER_IMPORT_SELECT_FILE, async () => {
    MainWindowManager.hide();
    TabbedBrowserWindowManager.hideAll();

    const result = await dialog.showOpenDialog({
      title: "选择书签文件",
      filters: [
        { name: "书签文件", extensions: ["html", "htm"] },
        { name: "所有文件", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });

    if (result.canceled || !result.filePaths.length) return null;

    try {
      const htmlContent = readFileSync(result.filePaths[0], "utf-8");
      return parseBookmarksHtml(htmlContent);
    } catch (error) {
      console.error("解析书签文件失败:", error);
      throw new Error("解析书签文件失败，请确保文件格式正确");
    }
  });

  ipcMain.handle(
    VS_GO_EVENT.BROWSER_IMPORT_BOOKMARKS,
    async (_event, bookmarks: BrowserItem[]) => {
      const list = vsgoStore.get("browserList", []) as BrowserItem[];
      const existingUrls = new Set(list.map((item) => item.url));
      const newBookmarks = bookmarks.filter((b) => !existingUrls.has(b.url));
      const updatedList = [...list, ...newBookmarks];
      vsgoStore.set("browserList", updatedList);

      return {
        imported: newBookmarks.length,
        duplicate: bookmarks.length - newBookmarks.length,
        total: updatedList.length,
      };
    }
  );

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

    const matchBookmarks = q
      ? bookmarks.filter(
          (b) => b.name.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
        )
      : bookmarks.slice(0, 8);

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
        .filter((item) => item.name.toLowerCase().includes(searchWord.toLowerCase()))
        .sort((a, b) => {
          const aScore = 100 - (a.name.toLowerCase().indexOf(searchWord.toLowerCase()) + 1);
          const bScore = 100 - (b.name.toLowerCase().indexOf(searchWord.toLowerCase()) + 1);
          return bScore - aScore;
        });
    }
  );
}
