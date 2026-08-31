import { useEffect, useState } from "react";
import { BrowserTabEvent, BrowserWindowEvent } from "../events";
import {
  REMOTE_BROWSER_CHROME_HEIGHT,
  tabUrlForAddressBarDisplay,
  type TabbedBrowserState,
} from "@shared/type";

const { ipcRenderer } = window.electron;

interface ControlDotProps {
  color: string;
  hoverColor: string;
  glyph: string;
  title: string;
  onClick: () => void;
}
function ControlDot({ color, hoverColor, glyph, title, onClick }: ControlDotProps): React.JSX.Element {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={
        {
          width: 12,
          height: 12,
          borderRadius: 6,
          background: hovered ? hoverColor : color,
          color: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 9,
          lineHeight: 1,
          cursor: "pointer",
          flexShrink: 0,
          transition: "background 0.1s",
          opacity: hovered ? 1 : 0.9,
          WebkitAppRegion: "no-drag",
        } as React.CSSProperties
      }
    >
      {hovered ? glyph : ""}
    </div>
  );
}

/**
 * 「远程浏览器控制」专属窗口的宿主渲染层。
 * 无边框窗口 + 自绘红绿灯（关闭/最小化/全屏），顶部一条紧凑横幅
 * 展示远程控制状态与当前被控制的 URL；页面由主进程挂载的 WebContentsView 承载。
 *
 * 高对比配色保证无论窗口是否在前台，都清晰呈现“正在被操作”。
 */
function RemoteBrowserControl(): React.JSX.Element {
  const [state, setState] = useState<TabbedBrowserState>({ tabs: [], activeTabId: null });

  useEffect(() => {
    ipcRenderer.invoke(BrowserTabEvent.BROWSER_TAB_GET_STATE).then((s: TabbedBrowserState) => {
      setState(s);
    });
    const onUpdate = (_e: unknown, s: TabbedBrowserState): void => {
      setState(s);
    };
    ipcRenderer.on(BrowserTabEvent.BROWSER_TAB_STATE_UPDATED, onUpdate);
    return () => {
      ipcRenderer.removeListener(BrowserTabEvent.BROWSER_TAB_STATE_UPDATED, onUpdate);
    };
  }, []);

  const active = state.tabs.find((t) => t.id === state.activeTabId);
  const url = tabUrlForAddressBarDisplay(active?.url ?? "");
  const loading = active?.loading ?? false;
  const remoteActive = active?.remoteActive ?? false;

  return (
    <div
      className="remote-browser-control-root"
      style={
        {
          height: REMOTE_BROWSER_CHROME_HEIGHT,
          width: "100vw",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 14px",
          boxSizing: "border-box",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: "linear-gradient(90deg, #1d4ed8 0%, #6d28d9 100%)",
          color: "#ffffff",
          position: "relative",
          zIndex: 100,
          borderBottom: "1px solid rgba(255,255,255,0.12)",
          WebkitAppRegion: "drag",
          userSelect: "none",
          MozUserSelect: "none",
        } as React.CSSProperties
      }
    >
      {/* 自绘红绿灯（关闭 / 最小化 / 全屏切换） */}
      <span
        style={
          {
            display: "flex",
            alignItems: "center",
            gap: 7,
            flexShrink: 0,
            WebkitAppRegion: "no-drag",
          } as React.CSSProperties
        }
      >
        <ControlDot
          color="#ff5f57"
          hoverColor="#ff3b30"
          glyph="×"
          title="关闭窗口"
          onClick={() => ipcRenderer.send(BrowserWindowEvent.BROWSER_WINDOW_CLOSE_WINDOW)}
        />
        <ControlDot
          color="#febc2e"
          hoverColor="#ff9500"
          glyph="−"
          title="最小化"
          onClick={() => ipcRenderer.send(BrowserWindowEvent.BROWSER_WINDOW_MINIMIZE)}
        />
        <ControlDot
          color="#28c840"
          hoverColor="#34c759"
          glyph="⤢"
          title="切换全屏"
          onClick={() => ipcRenderer.send(BrowserWindowEvent.BROWSER_WINDOW_TOGGLE_FULLSCREEN)}
        />
      </span>

      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: remoteActive ? "#34d399" : "#fbbf24",
          boxShadow: `0 0 7px 2px ${remoteActive ? "rgba(52,211,153,0.9)" : "rgba(251,191,36,0.85)"}`,
          animation: "rbcPulse 1.4s ease-in-out infinite",
          flexShrink: 0,
          marginLeft: 6,
        }}
      />
      <span
        style={{
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: 0.4,
          whiteSpace: "nowrap",
          flexShrink: 0,
          color: "#ffffff",
          textShadow: "0 1px 2px rgba(0,0,0,0.28)",
        }}
      >
        🔧 远程浏览器控制
      </span>
      <span style={{ color: "rgba(255,255,255,0.55)", flexShrink: 0 }}>·</span>
      {loading ? (
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.8)" }}>页面加载中…</span>
      ) : (
        <span
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.92)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
            textAlign: "left",
          }}
        >
          {url || "about:blank"}
        </span>
      )}
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          whiteSpace: "nowrap",
          flexShrink: 0,
          color: "#052e16",
          background: remoteActive ? "#34d399" : "#fbbf24",
          borderRadius: 999,
          padding: "2px 9px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
        }}
      >
        {remoteActive ? "正在被操作" : "待命中"}
      </span>
      <style>{`@keyframes rbcPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}

export default RemoteBrowserControl;
