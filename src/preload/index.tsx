import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import ReactDOM from "react-dom/client";
import PreLoadComponent from "./PreloadComponent/PreloadComponent";

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
    window.location.href.includes("main-window")
  ) {
    return;
  }
  // 添加到页面
  const root = document.createElement("div") as HTMLElement;
  root.id = "preload-root";
  
  // 为root元素添加样式，使用fixed定位确保始终在顶部
  root.style.cssText = `
    position: sticky;
    top: 0;
    z-index: 9999;
  `;
  document.body.insertBefore(root, document.body.firstChild);
  document.body.style.height = 'auto';
  const rootInstance = ReactDOM.createRoot(root);
  rootInstance.render(<PreLoadComponent />);

});
