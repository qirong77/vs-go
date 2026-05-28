import Store from "electron-store";

const schema = {
  fileAccessHistory: {
    type: "object",
    default: {},
    additionalProperties: { type: "number" },
  },
} as const;

const store = new Store({ schema });

export const fileAccessStore = {
  getHistory(): Record<string, number> {
    return store.get("fileAccessHistory", {}) as Record<string, number>;
  },
  updateAccessTime(filePath: string): void {
    const history = this.getHistory();
    history[filePath] = Date.now();
    store.set("fileAccessHistory", history);
  },
  getAccessTime(filePath: string): number | undefined {
    return this.getHistory()[filePath];
  },
};
