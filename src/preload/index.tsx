import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

// Custom APIs for renderer
const api = {};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}

window.addEventListener("load", () => {
  if (window.location.href.startsWith("file://")) {
    return;
  }
  if (
    window.location.href.includes("browser-setting") ||
    window.location.href.includes("terminal") ||
    window.location.href.includes("main-window")
  ) {
    return;
  }
  // 添加到页面
  const root = document.createElement("div") as HTMLElement;
  root.id = "preload-root";
});
