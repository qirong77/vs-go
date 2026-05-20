import { vsgoStore } from "@platform/store/instance";

export const fileAccessStore = {
  getHistory(): Record<string, number> {
    return vsgoStore.get("fileAccessHistory", {}) as Record<string, number>;
  },
  updateAccessTime(filePath: string): void {
    const history = this.getHistory();
    history[filePath] = Date.now();
    vsgoStore.set("fileAccessHistory", history);
  },
  getAccessTime(filePath: string): number | undefined {
    return this.getHistory()[filePath];
  },
};
