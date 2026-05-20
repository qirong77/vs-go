import { exposeElectronBridge } from "./base";

exposeElectronBridge();

/** 部分子窗口不需要 preload 注入的 DOM 根节点 */
const SKIP_PRELOAD_ROOT_HASHES = ["main-window"];

window.addEventListener("load", () => {
  if (window.location.href.startsWith("file://")) {
    return;
  }
  if (SKIP_PRELOAD_ROOT_HASHES.some((h) => window.location.href.includes(h))) {
    return;
  }
  const root = document.createElement("div");
  root.id = "preload-root";
  document.body.appendChild(root);
});
