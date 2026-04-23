import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VS_GO_EVENT } from "../../common/EVENT";
import {
  BROWSER_CHROME_HEIGHT,
  type TabState,
  type TabbedBrowserState,
} from "../../common/type";

const { ipcRenderer } = window.electron;

// 标签栏 32px + 地址栏 40px = 72px（必须与 common/type.ts BROWSER_CHROME_HEIGHT 一致）
const TAB_BAR_HEIGHT = 32;
const ADDRESS_BAR_HEIGHT = BROWSER_CHROME_HEIGHT - TAB_BAR_HEIGHT;
const TAB_MIN_WIDTH = 80;
const TAB_MAX_WIDTH = 220;

interface DragState {
  tabId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  tabStartIndex: number;
  offsetX: number; // 鼠标按下时相对 tab 左边的偏移
  detaching: boolean;
}

function TabbedBrowser(): React.JSX.Element {
  const [state, setState] = useState<TabbedBrowserState>({ tabs: [], activeTabId: null });
  const [address, setAddress] = useState("");
  const [editing, setEditing] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const activeTab = useMemo<TabState | undefined>(
    () => state.tabs.find((t) => t.id === state.activeTabId),
    [state]
  );

  // 初始拉取 state + 订阅更新
  useEffect(() => {
    ipcRenderer.invoke(VS_GO_EVENT.BROWSER_TAB_GET_STATE).then((s: TabbedBrowserState) => {
      setState(s);
    });
    const onUpdate = (_e: unknown, s: TabbedBrowserState): void => {
      setState(s);
    };
    const onFocusAddress = (): void => {
      setEditing(true);
      requestAnimationFrame(() => {
        addressInputRef.current?.focus();
        addressInputRef.current?.select();
      });
    };
    ipcRenderer.on(VS_GO_EVENT.BROWSER_TAB_STATE_UPDATED, onUpdate);
    ipcRenderer.on(VS_GO_EVENT.BROWSER_TAB_FOCUS_ADDRESS, onFocusAddress);
    return () => {
      ipcRenderer.removeAllListeners(VS_GO_EVENT.BROWSER_TAB_STATE_UPDATED);
      ipcRenderer.removeAllListeners(VS_GO_EVENT.BROWSER_TAB_FOCUS_ADDRESS);
    };
  }, []);

  // 当前 tab 变化 / URL 变化且未编辑时，同步 address bar
  useEffect(() => {
    if (!editing) {
      setAddress(activeTab?.url ?? "");
    }
  }, [activeTab?.url, activeTab?.id, editing]);

  // 地址栏操作
  const submitAddress = (mode: "current" | "new"): void => {
    const url = address.trim();
    if (!url) return;
    ipcRenderer.send(VS_GO_EVENT.BROWSER_TAB_NAVIGATE, { url, mode });
    addressInputRef.current?.blur();
    setEditing(false);
  };

  const handleAddressKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitAddress(e.shiftKey ? "new" : "current");
      return;
    }
    if (e.key === "Escape") {
      setEditing(false);
      setAddress(activeTab?.url ?? "");
      addressInputRef.current?.blur();
    }
  };

  // 标签操作
  const onSwitch = (id: string): void => {
    ipcRenderer.send(VS_GO_EVENT.BROWSER_TAB_SWITCH, id);
  };
  const onClose = (id: string, e?: React.MouseEvent): void => {
    e?.stopPropagation();
    ipcRenderer.send(VS_GO_EVENT.BROWSER_TAB_CLOSE, id);
  };
  const onNewTab = (): void => {
    ipcRenderer.send(VS_GO_EVENT.BROWSER_TAB_NEW, {});
  };

  // 鼠标中键关闭
  const onTabMouseDown = (e: React.MouseEvent<HTMLDivElement>, tab: TabState, index: number): void => {
    if (e.button === 1) {
      e.preventDefault();
      onClose(tab.id);
      return;
    }
    if (e.button !== 0) return;

    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;

    // 立即激活被按下的 tab
    if (tab.id !== state.activeTabId) onSwitch(tab.id);

    setDrag({
      tabId: tab.id,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      tabStartIndex: index,
      offsetX,
      detaching: false,
    });
  };

  // 全局 mousemove / mouseup 处理拖拽
  useEffect(() => {
    if (!drag) return;

    const barRect = tabBarRef.current?.getBoundingClientRect();

    const handleMove = (e: MouseEvent): void => {
      setDrag((prev) => {
        if (!prev) return prev;
        // 判定是否脱离标签栏：纵向离开 40px 或 超出标签栏边界
        const detachingNow =
          barRect &&
          (e.clientY < barRect.top - 40 ||
            e.clientY > barRect.bottom + 40 ||
            e.clientX < barRect.left - 60 ||
            e.clientX > barRect.right + 60);
        return {
          ...prev,
          currentX: e.clientX,
          currentY: e.clientY,
          detaching: !!detachingNow,
        };
      });

      // 标签栏内时做实时重排
      if (
        barRect &&
        e.clientY >= barRect.top - 10 &&
        e.clientY <= barRect.bottom + 10
      ) {
        reorderByPointer(e.clientX);
      }
    };

    const handleUp = (e: MouseEvent): void => {
      setDrag((prev) => {
        if (!prev) return null;
        const isDetach =
          !!barRect &&
          (e.clientY < barRect.top - 40 ||
            e.clientY > barRect.bottom + 40 ||
            e.clientX < barRect.left - 60 ||
            e.clientX > barRect.right + 60);
        if (isDetach) {
          ipcRenderer.send(VS_GO_EVENT.BROWSER_TAB_DETACH, prev.tabId);
        }
        return null;
      });
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.tabId]);

  // 按指针 x 位置实时重排
  const reorderByPointer = useCallback(
    (clientX: number): void => {
      const bar = tabBarRef.current;
      if (!bar || !drag) return;
      const tabs = Array.from(bar.querySelectorAll<HTMLElement>("[data-tab-id]"));
      const barLeft = bar.getBoundingClientRect().left;
      const x = clientX - barLeft;
      let newIndex = state.tabs.length - 1;
      let acc = 0;
      for (let i = 0; i < tabs.length; i++) {
        const w = tabs[i].offsetWidth;
        if (x < acc + w / 2) {
          newIndex = i;
          break;
        }
        acc += w;
      }
      const currentIndex = state.tabs.findIndex((t) => t.id === drag.tabId);
      if (currentIndex !== -1 && currentIndex !== newIndex) {
        ipcRenderer.send(VS_GO_EVENT.BROWSER_TAB_REORDER, {
          tabId: drag.tabId,
          toIndex: newIndex,
        });
      }
    },
    [drag, state.tabs]
  );

  // 计算单个 tab 的宽度（总宽度 / tab 数量，夹在 min/max 之间）
  const tabWidth = useMemo(() => {
    const count = Math.max(1, state.tabs.length);
    const barWidth = tabBarRef.current?.clientWidth ?? 800;
    const availableWidth = barWidth - 40 /* 新建按钮 */ - 80 /* 红绿灯 */;
    const w = Math.floor(availableWidth / count);
    return Math.max(TAB_MIN_WIDTH, Math.min(TAB_MAX_WIDTH, w));
  }, [state.tabs.length]);

  return (
    <div
      style={{
        height: BROWSER_CHROME_HEIGHT,
        MozUserSelect: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        overflow: "hidden",
        background: "#dee1e6",
      }}
    >
      {/* 标签栏 */}
      <div
        ref={tabBarRef}
        style={{
          height: TAB_BAR_HEIGHT,
          display: "flex",
          alignItems: "flex-end",
          paddingLeft: 80 /* 给 macOS 红绿灯让位 */,
          paddingRight: 8,
          position: "relative",
          WebkitAppRegion: "drag",
        } as React.CSSProperties}
      >
        {state.tabs.map((tab, idx) => {
          const isActive = tab.id === state.activeTabId;
          const isDragging = drag?.tabId === tab.id;
          const translateX =
            isDragging && drag
              ? Math.min(Math.max(drag.currentX - drag.startX, -4000), 4000)
              : 0;
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              onMouseDown={(e) => onTabMouseDown(e, tab, idx)}
              onAuxClick={(e) => {
                if (e.button === 1) onClose(tab.id);
              }}
              style={{
                width: tabWidth,
                height: TAB_BAR_HEIGHT - 4,
                marginRight: 2,
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                background: isActive ? "#ffffff" : "#cfd3d8",
                color: "#202124",
                display: "flex",
                alignItems: "center",
                padding: "0 10px",
                transform: `translateX(${translateX}px)`,
                transition: isDragging ? "none" : "transform 120ms ease",
                boxSizing: "border-box",
                opacity: drag?.detaching && isDragging ? 0.4 : 1,
                cursor: "default",
                position: "relative",
                zIndex: isActive ? 2 : 1,
                WebkitAppRegion: "no-drag",
              } as React.CSSProperties}
              title={tab.title || tab.url}
            >
              {tab.favicon ? (
                <img
                  src={tab.favicon}
                  alt=""
                  style={{ width: 14, height: 14, marginRight: 6, flexShrink: 0 }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 14,
                    height: 14,
                    marginRight: 6,
                    flexShrink: 0,
                    borderRadius: 3,
                    background: "#b7babe",
                  }}
                />
              )}
              <span
                style={{
                  flex: 1,
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {tab.loading ? "加载中..." : tab.title || tab.url || "新标签页"}
              </span>
              <button
                onClick={(e) => onClose(tab.id, e)}
                onMouseDown={(e) => e.stopPropagation()}
                title="关闭"
                tabIndex={-1}
                style={{
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  marginLeft: 4,
                  cursor: "pointer",
                  fontSize: 14,
                  lineHeight: 1,
                  color: "#5f6368",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background = "#e0e0e0")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background = "transparent")
                }
              >
                ×
              </button>
            </div>
          );
        })}
        <button
          onClick={onNewTab}
          title="新建标签页 (Cmd+T)"
          tabIndex={-1}
          style={{
            width: 28,
            height: 24,
            marginLeft: 4,
            marginBottom: 2,
            border: "none",
            outline: "none",
            borderRadius: 4,
            background: "transparent",
            cursor: "pointer",
            fontSize: 16,
            color: "#5f6368",
            WebkitAppRegion: "no-drag",
          } as React.CSSProperties}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background = "#c2c6cb")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background = "transparent")
          }
        >
          +
        </button>
      </div>

      {/* 地址栏 */}
      <div
        style={{
          height: ADDRESS_BAR_HEIGHT,
          background: "#ffffff",
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          gap: 4,
          borderBottom: "1px solid #e0e0e0",
        }}
      >
        <NavButton
          title="后退"
          disabled={!activeTab?.canGoBack}
          onClick={() => ipcRenderer.send(VS_GO_EVENT.BROWSER_TAB_BACK)}
        >
          ‹
        </NavButton>
        <NavButton
          title="前进"
          disabled={!activeTab?.canGoForward}
          onClick={() => ipcRenderer.send(VS_GO_EVENT.BROWSER_TAB_FORWARD)}
        >
          ›
        </NavButton>
        <NavButton
          title="刷新"
          onClick={() => ipcRenderer.send(VS_GO_EVENT.BROWSER_TAB_RELOAD)}
        >
          ⟳
        </NavButton>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            background: "#f1f3f4",
            borderRadius: 18,
            height: 28,
            padding: "0 12px",
            marginLeft: 4,
          }}
        >
          <input
            ref={addressInputRef}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={() => {
              setEditing(true);
              requestAnimationFrame(() => addressInputRef.current?.select());
            }}
            onBlur={() => setEditing(false)}
            onKeyDown={handleAddressKeyDown}
            placeholder="搜索 Google 或输入网址"
            spellCheck={false}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 13,
              color: "#202124",
              userSelect: "text",
              WebkitUserSelect: "text",
            }}
          />
        </div>
        <NavButton
          title="开发者工具"
          onClick={() => ipcRenderer.send(VS_GO_EVENT.BROWSER_TAB_TOGGLE_DEVTOOLS)}
          small
        >
          ⋮
        </NavButton>
      </div>
    </div>
  );
}

interface NavButtonProps {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  small?: boolean;
}
function NavButton({
  title,
  onClick,
  disabled,
  children,
  small,
}: NavButtonProps): React.JSX.Element {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      tabIndex={-1}
      style={{
        width: small ? 26 : 30,
        height: 28,
        border: "none",
        outline: "none",
        borderRadius: 14,
        background: "transparent",
        color: disabled ? "#bdc1c6" : "#5f6368",
        fontSize: small ? 14 : 18,
        cursor: disabled ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = "#f1f3f4";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

export default TabbedBrowser;
