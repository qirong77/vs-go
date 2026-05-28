import Store from "electron-store";
import type { BrowserItem } from "@shared/type";

const schema = {
  browserList: {
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
};
