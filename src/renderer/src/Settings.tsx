import { useState } from "react";
import UserNotes from "./UserNotes";
import DisplayManager from "./DisplayManager";
import AppSetting from "./AppSetting";
import BrowserSetting from "./BrowserSetting";
import ScriptEditor from "./ScriptEditor";

type MenuKey = "notes" | "display" | "app" | "browser" | "script";

interface MenuItem {
  key: MenuKey;
  label: string;
  icon: string;
  Component: React.FC;
}

const MENU: MenuItem[] = [
  { key: "notes", label: "笔记", icon: "📝", Component: UserNotes },
  { key: "display", label: "屏幕管理", icon: "🖥️", Component: DisplayManager },
  { key: "app", label: "App 设置", icon: "⚙️", Component: AppSetting },
  { key: "browser", label: "浏览器设置", icon: "🌐", Component: BrowserSetting },
  { key: "script", label: "脚本", icon: "📜", Component: ScriptEditor },
];

function Settings(): React.JSX.Element {
  const [active, setActive] = useState<MenuKey>("app");
  const current = MENU.find((m) => m.key === active) ?? MENU[0];
  const Current = current.Component;

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        background: "#f5f6f7",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* 左侧菜单 */}
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          background: "#ffffff",
          borderRight: "1px solid #e5e7eb",
          padding: "20px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          overflowY: "auto",
        }}
      >
        <div
          style={{
            padding: "0 8px 16px 8px",
            fontSize: 13,
            fontWeight: 600,
            color: "#6b7280",
            letterSpacing: 0.4,
          }}
        >
          设置
        </div>
        {MENU.map((m) => {
          const isActive = m.key === active;
          return (
            <button
              key={m.key}
              onClick={() => setActive(m.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                border: "none",
                borderRadius: 6,
                background: isActive ? "#e8f0fe" : "transparent",
                color: isActive ? "#1a73e8" : "#202124",
                fontSize: 14,
                fontWeight: isActive ? 600 : 500,
                cursor: "pointer",
                textAlign: "left",
                transition: "background 120ms ease",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = "#f1f3f4";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }
              }}
            >
              <span style={{ fontSize: 16 }}>{m.icon}</span>
              <span>{m.label}</span>
            </button>
          );
        })}
      </aside>

      {/* 右侧内容 */}
      <main
        key={current.key}
        style={{
          flex: 1,
          minWidth: 0,
          height: "100vh",
          overflow: "auto",
          background: "#ffffff",
        }}
      >
        <Current />
      </main>
    </div>
  );
}

export default Settings;
