import { useEffect, useRef } from "react";
import "./monaco-env";
import * as monaco from "monaco-editor";
import { VS_GO_EVENT } from "../../common/EVENT";

const { ipcRenderer } = window.electron;

function ScriptEditor() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let editor: monaco.editor.IStandaloneCodeEditor | null = null;
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let modelSub: monaco.IDisposable | null = null;
    let cancelled = false;

    void ipcRenderer.invoke(VS_GO_EVENT.WINDOW_SCRIPT_GET).then((content: string) => {
      if (cancelled || !containerRef.current) return;
      editor = monaco.editor.create(containerRef.current, {
        value: content,
        language: "javascript",
        theme: "vs",
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        scrollBeyondLastLine: false,
      });

      const scheduleSave = () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          if (editor) void ipcRenderer.invoke(VS_GO_EVENT.WINDOW_SCRIPT_SAVE, editor.getValue());
        }, 500);
      };

      modelSub = editor.onDidChangeModelContent(scheduleSave);
    });

    return () => {
      cancelled = true;
      if (saveTimer) clearTimeout(saveTimer);
      modelSub?.dispose();
      editor?.dispose();
    };
  }, []);

  return (
    <div className="flex flex-col w-full  bg-white dark:bg-gray-900 h-screen">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">脚本</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          JavaScript，保存在本机。浮动浏览器窗口每次页面加载完成后会在该页面上下文中执行（修改后约半秒自动保存）。
        </p>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
}

export default ScriptEditor;
