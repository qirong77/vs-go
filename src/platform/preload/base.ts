import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

export function exposeElectronBridge(): void {
  if (process.contextIsolated) {
    try {
      contextBridge.exposeInMainWorld("electron", electronAPI);
    } catch (error) {
      console.error(error);
    }
    return;
  }

  // @ts-ignore legacy non-isolated mode
  window.electron = electronAPI;
}
