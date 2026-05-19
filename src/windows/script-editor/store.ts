import { vsgoStore } from "@platform/store/instance";

export const windowScriptStore = {
  get(): string {
    return vsgoStore.get("floatingWindowUserScript", "") as string;
  },
  save(content: string): void {
    vsgoStore.set("floatingWindowUserScript", content);
  },
};
