import Store from "electron-store";

const schema = {
  floatingWindowUserScript: {
    type: "string",
    default: "",
  },
} as const;

const store = new Store({ schema });

export const windowScriptStore = {
  get(): string {
    return store.get("floatingWindowUserScript", "") as string;
  },
  save(content: string): void {
    store.set("floatingWindowUserScript", content);
  },
};
