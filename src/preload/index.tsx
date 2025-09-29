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
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    z-index: 999999 !important;
    pointer-events: none !important;
    width: 100% !important;
    box-sizing: border-box !important;
  `;
  
  document.body.insertBefore(root, document.body.firstChild);
  
  const rootInstance = ReactDOM.createRoot(root);
  rootInstance.render(<PreLoadComponent />);
  
  // 等待渲染完成后调整body padding
  setTimeout(() => {
    const toolbarHeight = root.offsetHeight;
    if (toolbarHeight > 0) {
      const originalBodyStyle = document.body.style.paddingTop;
      document.body.style.paddingTop = `${toolbarHeight}px`;
      
      // 当组件卸载时恢复原始样式
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            const removedNodes = Array.from(mutation.removedNodes);
            if (removedNodes.some(node => node === root)) {
              document.body.style.paddingTop = originalBodyStyle;
              observer.disconnect();
            }
          }
        });
      });
      observer.observe(document.body, { childList: true });
    }
  }, 100);
});
