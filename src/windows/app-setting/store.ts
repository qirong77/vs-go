import Store from "electron-store";
import type { AppSettings, WorkspaceApp } from "@shared/type";

const schema = {
  appSettings: {
    type: "object",
    default: { defaultEditor: "vscode" },
    properties: {
      defaultEditor: { type: "string" },
    },
  },
  workspaceApps: {
    type: "array",
    default: [],
    items: {
      type: "object",
      properties: {
        displayName: { type: "string" },
        bundleName: { type: "string" },
      },
    },
  },
} as const;

const store = new Store({ schema });

export const appSettingStore = {
  getSettings(): AppSettings {
    return store.get("appSettings", { defaultEditor: "vscode" }) as AppSettings;
  },
  setSettings(settings: AppSettings): void {
    store.set("appSettings", settings);
  },
  getWorkspaceApps(): WorkspaceApp[] {
    return store.get("workspaceApps", []) as WorkspaceApp[];
  },
  setWorkspaceApps(apps: WorkspaceApp[]): void {
    store.set("workspaceApps", apps);
  },
};
