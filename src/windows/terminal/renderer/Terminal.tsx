import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { TerminalEvent } from "../events";

const { ipcRenderer } = window.electron;

interface TabInfo {
  id: string;
  port: number;
  title: string;
  status: "starting" | "ready";
  url: string | null;
}

interface TerminalState {
  tabs: TabInfo[];
  activeTabId: string | null;
}

const TAB_BAR_HEIGHT = 32;
const TAB_MIN_WIDTH = 80;
const TAB_MAX_WIDTH = 220;
const dragRegionStyle = { WebkitAppRegion: "drag" } as CSSProperties;
const noDragRegionStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;

function Terminal(): React.JSX.Element {
  const [state, setState] = useState<TerminalState>({ tabs: [], activeTabId: null });
  const tabBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void ipcRenderer.invoke(TerminalEvent.GET_STATE).then((s: TerminalState) => {
      setState(s);
    });

    const onUpdate = (_e: unknown, s: TerminalState): void => {
      setState(s);
    };
    ipcRenderer.on(TerminalEvent.STATE_UPDATED, onUpdate);
    return () => {
      ipcRenderer.removeListener(TerminalEvent.STATE_UPDATED, onUpdate);
    };
  }, []);

  const onNewTab = useCallback(() => {
    ipcRenderer.send(TerminalEvent.NEW_TAB);
  }, []);

  const onActivate = useCallback((tabId: string) => {
    ipcRenderer.send(TerminalEvent.ACTIVATE_TAB, tabId);
  }, []);

  const onClose = useCallback((tabId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    ipcRenderer.send(TerminalEvent.CLOSE_TAB, tabId);
  }, []);

  const tabWidth = ((): number => {
    const count = Math.max(1, state.tabs.length);
    const barWidth = tabBarRef.current?.clientWidth ?? 800;
    const availableWidth = barWidth - 40 /* 新建按钮 */ - 80;
    return Math.max(TAB_MIN_WIDTH, Math.min(TAB_MAX_WIDTH, Math.floor(availableWidth / count)));
  })();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        ref={tabBarRef}
        style={{
          height: TAB_BAR_HEIGHT,
          display: "flex",
          alignItems: "flex-end",
          paddingLeft: 80,
          paddingRight: 8,
          background: "#1e293b",
          borderBottom: "1px solid #334155",
          overflow: "hidden",
          flexShrink: 0,
          ...dragRegionStyle,
        }}
      >
        {state.tabs.map((tab) => {
          const isActive = tab.id === state.activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => onActivate(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1) onClose(tab.id);
              }}
              style={{
                width: tabWidth,
                height: TAB_BAR_HEIGHT - 2,
                marginRight: 1,
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                background: isActive ? "#0f172a" : "#334155",
                color: isActive ? "#e2e8f0" : "#94a3b8",
                display: "flex",
                alignItems: "center",
                padding: "0 10px",
                boxSizing: "border-box",
                cursor: "default",
                fontSize: 12,
                ...noDragRegionStyle,
              }}
              title={tab.title}
            >
              <span
                style={{
                  flex: 1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {tab.title}
              </span>
              {tab.status === "starting" && (
                <span
                  style={{
                    marginLeft: 6,
                    color: "#38bdf8",
                    fontSize: 10,
                    flexShrink: 0,
                  }}
                >
                  启动中
                </span>
              )}
              <button
                type="button"
                aria-label="关闭"
                onClick={(e) => onClose(tab.id, e)}
                onMouseDown={(e) => e.stopPropagation()}
                title="关闭"
                tabIndex={-1}
                style={{
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  marginLeft: 4,
                  cursor: "pointer",
                  fontSize: 12,
                  lineHeight: 1,
                  color: "#64748b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background = "#475569")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background = "transparent")
                }
              >
                x
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={onNewTab}
          title="新建终端"
          tabIndex={-1}
          style={{
            width: 26,
            height: 22,
            marginLeft: 4,
            marginBottom: 2,
            border: "none",
            outline: "none",
            borderRadius: 4,
            background: "transparent",
            cursor: "pointer",
            fontSize: 15,
            color: "#94a3b8",
            ...noDragRegionStyle,
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background = "#475569")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background = "transparent")
          }
        >
          +
        </button>
      </div>

      <div style={{ flex: 1, position: "relative" }}>
        {state.tabs.map((tab) => {
          const isActive = tab.id === state.activeTabId;
          if (tab.status !== "ready" || !tab.url) {
            return (
              <div
                key={tab.id}
                style={{
                  position: "absolute",
                  inset: 0,
                  display: isActive ? "flex" : "none",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#64748b",
                  fontSize: 14,
                }}
              >
                正在启动终端...
              </div>
            );
          }

          return (
            <iframe
              key={tab.id}
              src={tab.url}
              title={tab.title}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                border: "none",
                display: isActive ? "block" : "none",
              }}
            />
          );
        })}
        {state.tabs.length === 0 && (
          <button
            type="button"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: "100%",
              color: "#475569",
              fontSize: 14,
              cursor: "pointer",
              border: "none",
              background: "transparent",
            }}
            onClick={onNewTab}
          >
            + 新建终端
          </button>
        )}
      </div>
    </div>
  );
}

export default Terminal;
