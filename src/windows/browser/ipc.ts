import { BrowserWindow, ipcMain } from "electron";
import { BrowserFloatingEvent } from "@windows/browser/events/floating";
import { BrowserOverlayEvent } from "@windows/browser/events/overlay";
import { BrowserSettingsEvent } from "@windows/browser/events/settings";
import type { BrowserItem } from "@shared/type";
import { vsgoStore } from "./store";
import { fileAccessStore } from "@windows/main-window/store";
import { TabbedBrowserWindowManager } from "./electron/TabbedBrowserWindowManager";
import { MainWindowManager } from "@windows/main-window/electron";

export function registerBrowserHandlers(): void {
  ipcMain.handle(BrowserSettingsEvent.BROWSER_LIST, async () => {
    return vsgoStore.get("browserList", []) as BrowserItem[];
  });

  ipcMain.handle(BrowserSettingsEvent.BROWSER_ADD, async (_event, item: BrowserItem) => {
    const list = vsgoStore.get("browserList", []) as BrowserItem[];
    const siblings = list.filter((i) => (i.parentId ?? null) === (item.parentId ?? null));
    const maxOrder = siblings.reduce((max, i) => Math.max(max, i.order ?? 0), -1);
    item.order = maxOrder + 1;
    list.push(item);
    vsgoStore.set("browserList", list);
    return list;
  });

  ipcMain.handle(BrowserSettingsEvent.BROWSER_REMOVE, async (_event, id: string) => {
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

  ipcMain.handle(BrowserSettingsEvent.BROWSER_REORDER, async (_event, payload: { id: string; order: number; parentId?: string | null }) => {
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

  ipcMain.handle(BrowserSettingsEvent.BROWSER_REMOVE_ALL, async () => {
    vsgoStore.set("browserList", []);
    return [];
  });

  ipcMain.handle(BrowserSettingsEvent.BROWSER_UPDATE, async (_event, item: BrowserItem) => {
    const list = vsgoStore.get("browserList", []) as BrowserItem[];
    const index = list.findIndex((i) => i.id === item.id);
    if (index !== -1) {
      list[index] = item;
      vsgoStore.set("browserList", list);
    }
    return list;
  });

  ipcMain.on(BrowserFloatingEvent.FLOATING_WINDOW_CREATE, (_e, item: BrowserItem) => {
    const url = item.url;
    if (!url) return;
    fileAccessStore.updateAccessTime(url);
    TabbedBrowserWindowManager.openUrl(url);
    MainWindowManager.hide();
  });

  ipcMain.on(BrowserOverlayEvent.BROWSER_OVERLAY_SHOW, (e, payload: { bounds: { x: number; y: number; width: number; height: number }; data: unknown }) => {
    const bw = BrowserWindow.fromWebContents(e.sender);
    if (bw) {
      TabbedBrowserWindowManager.showOverlay(bw.id, payload.bounds, payload.data);
    }
  });

  ipcMain.on(BrowserOverlayEvent.BROWSER_OVERLAY_HIDE, (e) => {
    const bw = BrowserWindow.fromWebContents(e.sender);
    if (bw) {
      TabbedBrowserWindowManager.hideOverlay(bw.id);
    }
  });

  ipcMain.on(BrowserOverlayEvent.BROWSER_OVERLAY_ACTION, (event, payload: Record<string, unknown>) => {
    TabbedBrowserWindowManager.handleOverlayAction(event, payload);
  });

  ipcMain.handle(
    BrowserFloatingEvent.FLOATING_WINDOW_SEARCH_URL,
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
