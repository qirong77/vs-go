import { BrowserWindow, ipcMain } from "electron";
import { BrowserOverlayEvent, BrowserSettingsEvent } from "./events";
import type { BrowserItem } from "@shared/type";
import { browserStore } from "./store";
import { TabbedBrowserWindowManager } from "./electron/TabbedBrowserWindowManager";

export function registerBrowserHandlers(): void {
  ipcMain.handle(BrowserSettingsEvent.BROWSER_LIST, async () => {
    return browserStore.getList();
  });

  ipcMain.handle(BrowserSettingsEvent.BROWSER_HISTORY_LIST, async () => {
    return browserStore.getHistory();
  });

  ipcMain.handle(BrowserSettingsEvent.BROWSER_ADD, async (_event, item: BrowserItem) => {
    const list = browserStore.getList();
    const siblings = list.filter((i) => (i.parentId ?? null) === (item.parentId ?? null));
    const maxOrder = siblings.reduce((max, i) => Math.max(max, i.order ?? 0), -1);
    item.order = maxOrder + 1;
    list.push(item);
    browserStore.setList(list);
    return list;
  });

  ipcMain.handle(BrowserSettingsEvent.BROWSER_REMOVE, async (_event, id: string) => {
    const list = browserStore.getList();
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
    browserStore.setList(next);
    return next;
  });

  ipcMain.handle(
    BrowserSettingsEvent.BROWSER_REORDER,
    async (_event, payload: { id: string; order: number; parentId?: string | null }) => {
      const list = browserStore.getList();
      const idx = list.findIndex((i) => i.id === payload.id);
      if (idx !== -1) {
        list[idx].order = payload.order;
        if (payload.parentId !== undefined) {
          list[idx].parentId = payload.parentId;
        }
        browserStore.setList(list);
      }
      return list;
    }
  );

  ipcMain.handle(BrowserSettingsEvent.BROWSER_UPDATE, async (_event, item: BrowserItem) => {
    const list = browserStore.getList();
    const index = list.findIndex((i) => i.id === item.id);
    if (index !== -1) {
      list[index] = item;
      browserStore.setList(list);
    }
    return list;
  });

  ipcMain.on(
    BrowserOverlayEvent.BROWSER_OVERLAY_SHOW,
    (
      e,
      payload: { bounds: { x: number; y: number; width: number; height: number }; data: unknown }
    ) => {
      const bw = BrowserWindow.fromWebContents(e.sender);
      if (bw) {
        TabbedBrowserWindowManager.showOverlay(bw.id, payload.bounds, payload.data);
      }
    }
  );

  ipcMain.on(
    BrowserOverlayEvent.BROWSER_OVERLAY_HIDE,
    (e, payload?: { refocusHost?: boolean }) => {
      const bw = BrowserWindow.fromWebContents(e.sender);
      if (bw) {
        TabbedBrowserWindowManager.hideOverlay(bw.id, payload?.refocusHost !== false);
      }
    }
  );

  ipcMain.on(
    BrowserOverlayEvent.BROWSER_OVERLAY_ACTION,
    (event, payload: Record<string, unknown>) => {
      TabbedBrowserWindowManager.handleOverlayAction(event, payload);
    }
  );
}
