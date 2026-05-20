import { useCallback, useEffect, useRef, useState } from "react";
import { LogEvent } from "@platform/log/events";
import type { LogEntry, LogLevel } from "@platform/log/types";

const { ipcRenderer } = window.electron;

const LEVEL_COLOR: Record<LogLevel, string> = {
  info: "#93c5fd",
  warn: "#fcd34d",
  error: "#fca5a5",
};

function LogViewer(): React.JSX.Element {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    void ipcRenderer.invoke(LogEvent.GET_ALL).then((initial: LogEntry[]) => {
      setLogs(initial);
      requestAnimationFrame(scrollToBottom);
    });

    const onAppend = (_e: unknown, entry: LogEntry): void => {
      setLogs((prev) => [...prev, entry]);
    };
    const onCleared = (): void => {
      setLogs([]);
    };

    ipcRenderer.on(LogEvent.APPEND, onAppend);
    ipcRenderer.on(LogEvent.CLEARED, onCleared);
    return () => {
      ipcRenderer.removeListener(LogEvent.APPEND, onAppend);
      ipcRenderer.removeListener(LogEvent.CLEARED, onCleared);
    };
  }, [scrollToBottom]);

  useEffect(() => {
    if (autoScroll) scrollToBottom();
  }, [logs, autoScroll, scrollToBottom]);

  const handleClear = (): void => {
    ipcRenderer.send(LogEvent.CLEAR);
    setLogs([]);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
        fontSize: 12,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px",
          borderBottom: "1px solid #334155",
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>VsGo 运行日志</span>
        <span style={{ color: "#94a3b8" }}>{logs.length} 条</span>
        <div style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
          />
          自动滚动
        </label>
        <button
          type="button"
          onClick={handleClear}
          style={{
            padding: "4px 12px",
            borderRadius: 4,
            border: "1px solid #475569",
            background: "#1e293b",
            color: "#e2e8f0",
            cursor: "pointer",
          }}
        >
          清空
        </button>
      </header>

      <div ref={listRef} style={{ flex: 1, overflow: "auto", padding: "8px 12px" }}>
        {logs.length === 0 ? (
          <div style={{ color: "#64748b", padding: 8 }}>暂无日志</div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              style={{
                marginBottom: 6,
                padding: "6px 8px",
                borderRadius: 4,
                background: "#1e293b",
                lineHeight: 1.5,
                wordBreak: "break-all",
              }}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ color: "#64748b" }}>{log.time}</span>
                <span style={{ color: LEVEL_COLOR[log.level], fontWeight: 600 }}>
                  {log.level.toUpperCase()}
                </span>
                <span style={{ color: "#38bdf8" }}>[{log.scope}]</span>
                <span>{log.message}</span>
              </div>
              {log.detail && (
                <pre
                  style={{
                    margin: "4px 0 0",
                    color: "#94a3b8",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {log.detail}
                </pre>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default LogViewer;
