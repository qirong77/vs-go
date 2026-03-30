import editorWorkerUrl from "monaco-editor/esm/vs/editor/editor.worker.js?url";
import tsWorkerUrl from "monaco-editor/esm/vs/language/typescript/ts.worker.js?url";

// 使用 ?url 而非 ?worker，避免部分 Node/Vite 组合下 worker 插件调用 crypto.hash 失败
self.MonacoEnvironment = {
  getWorkerUrl(_moduleId: string, label: string) {
    if (label === "typescript" || label === "javascript") {
      return tsWorkerUrl;
    }
    return editorWorkerUrl;
  },
};
