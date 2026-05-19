import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

const api = {};

export function exposeElectronBridge(): void {
  if (process.contextIsolated) {
    try {
      contextBridge.exposeInMainWorld("electron", electronAPI);
      contextBridge.exposeInMainWorld("api", api);
    } catch (error) {
      console.error(error);
    }
    return;
  }

  // @ts-ignore legacy non-isolated mode
  window.electron = electronAPI;
  // @ts-ignore legacy non-isolated mode
  window.api = api;
}
