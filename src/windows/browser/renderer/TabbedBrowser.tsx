import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserSettingsEvent, BrowserTabEvent, BrowserWindowEvent } from "../events";
import {
  BROWSER_CHROME_HEIGHT,
  tabUrlForAddressBarDisplay,
  type BrowserItem,
  type TabState,
  type TabbedBrowserState,
} from "@shared/type";
import { bookmarkUrlsMatch } from "./bookmark/bookmarkUtils";
import {
  BookmarkChromeBarRow,
  BookmarkChromeProvider,
  BookmarkChromeStar,
} from "./bookmark/BookmarkChromeBar";

const { ipcRenderer } = window.electron;

// 标签栏 32px + 地址栏行 40px + 书签栏 28px + 底边距 6px = 106px（与 common/type.ts BROWSER_CHROME_HEIGHT 一致）
const TAB_BAR_HEIGHT = 32;
const ADDRESS_ROW_HEIGHT = 40;
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bookmarks, setBookmarks] = useState<BrowserItem[]>([]);

  const activeTab = useMemo<TabState | undefined>(
    () => state.tabs.find((t) => t.id === state.activeTabId),
    [state]
  );

  const bookmarkTargetUrl = (activeTab?.url ?? "").trim();
  const existingBookmark = useMemo(
    () =>
      bookmarks.find(
        (b) =>
          b.type === "bookmark" &&
          !!b.url &&
          bookmarkUrlsMatch(b.url, bookmarkTargetUrl)
      ),
    [bookmarks, bookmarkTargetUrl]
  );
  const canBookmark =
    !!bookmarkTargetUrl && bookmarkTargetUrl !== "about:blank";

  const refreshBookmarks = useCallback(async (): Promise<void> => {
    const list = (await ipcRenderer.invoke(BrowserSettingsEvent.BROWSER_LIST)) as BrowserItem[] | null;
    setBookmarks(Array.isArray(list) ? list : []);
  }, []);

  // 初始拉取 state + 订阅更新
  useEffect(() => {
    ipcRenderer.invoke(BrowserTabEvent.BROWSER_TAB_GET_STATE).then((s: TabbedBrowserState) => {
      setState(s);
    });
    ipcRenderer.invoke(BrowserWindowEvent.BROWSER_WINDOW_IS_FULLSCREEN).then((fs: boolean) => {
      setIsFullscreen(fs);
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
    const onBlurAddress = (): void => {
      setEditing(false);
      addressInputRef.current?.blur();
    };
    const onFullscreenChanged = (_e: unknown, fs: boolean): void => {
      setIsFullscreen(fs);
    };
    ipcRenderer.on(BrowserTabEvent.BROWSER_TAB_STATE_UPDATED, onUpdate);
    ipcRenderer.on(BrowserTabEvent.BROWSER_TAB_FOCUS_ADDRESS, onFocusAddress);
    ipcRenderer.on(BrowserTabEvent.BROWSER_TAB_BLUR_ADDRESS, onBlurAddress);
    ipcRenderer.on(BrowserWindowEvent.BROWSER_WINDOW_FULLSCREEN_CHANGED, onFullscreenChanged);
    return () => {
      ipcRenderer.removeListener(BrowserTabEvent.BROWSER_TAB_STATE_UPDATED, onUpdate);
      ipcRenderer.removeListener(BrowserTabEvent.BROWSER_TAB_FOCUS_ADDRESS, onFocusAddress);
      ipcRenderer.removeListener(BrowserTabEvent.BROWSER_TAB_BLUR_ADDRESS, onBlurAddress);
      ipcRenderer.removeListener(BrowserWindowEvent.BROWSER_WINDOW_FULLSCREEN_CHANGED, onFullscreenChanged);
    };
  }, []);

  useEffect(() => {
    void refreshBookmarks();
  }, [refreshBookmarks]);

  // 当前 tab 变化 / URL 变化且未编辑时，同步 address bar（默认首页在栏内显示为空）
  useEffect(() => {
    if (!editing) {
      setAddress(tabUrlForAddressBarDisplay(activeTab?.url ?? ""));
    }
  }, [activeTab?.url, activeTab?.id, editing]);

  // 切换标签时重置地址栏编辑态
  useEffect(() => {
    setEditing(false);
  }, [activeTab?.id]);

  const submitAddress = useCallback((mode: "current" | "new", overrideUrl?: string): void => {
    const url = (overrideUrl ?? address).trim();
    if (!url) return;
    ipcRenderer.send(BrowserTabEvent.BROWSER_TAB_NAVIGATE, { url, mode });
    addressInputRef.current?.blur();
    setEditing(false);
  }, [address]);

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setAddress(e.target.value);
  };

  const handleAddressKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitAddress(e.shiftKey ? "new" : "current");
      return;
    }
    if (e.key === "Escape") {
      setEditing(false);
      setAddress(tabUrlForAddressBarDisplay(activeTab?.url ?? ""));
      addressInputRef.current?.blur();
    }
  };

  // 标签操作
  const onSwitch = (id: string): void => {
    ipcRenderer.send(BrowserTabEvent.BROWSER_TAB_SWITCH, id);
  };
  const onClose = (id: string, e?: React.MouseEvent): void => {
    e?.stopPropagation();
    ipcRenderer.send(BrowserTabEvent.BROWSER_TAB_CLOSE, id);
  };
  const onNewTab = (): void => {
    ipcRenderer.send(BrowserTabEvent.BROWSER_TAB_NEW, {});
  };

  // 鼠标中键关闭
  const onTabMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    tab: TabState,
    index: number
  ): void => {
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
      if (barRect && e.clientY >= barRect.top - 10 && e.clientY <= barRect.bottom + 10) {
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
          ipcRenderer.send(BrowserTabEvent.BROWSER_TAB_DETACH, prev.tabId);
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
        ipcRenderer.send(BrowserTabEvent.BROWSER_TAB_REORDER, {
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
    const availableWidth = barWidth - 40 /* 新建按钮 */ - 80; /* 红绿灯 */
    const w = Math.floor(availableWidth / count);
    return Math.max(TAB_MIN_WIDTH, Math.min(TAB_MAX_WIDTH, w));
  }, [state.tabs.length]);

  return (
    <div
      className="tabbed-browser-chrome-root"
      style={{
        height: BROWSER_CHROME_HEIGHT,
        MozUserSelect: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        overflow: "visible",
        background: "#dee1e6",
        position: "relative",
        zIndex: 100,
      }}
    >
      <BookmarkChromeProvider
        bookmarks={bookmarks}
        onBookmarksUpdated={refreshBookmarks}
        submitAddress={submitAddress}
        bookmarkTargetUrl={bookmarkTargetUrl}
        activeTabTitle={activeTab?.title ?? ""}
        activeTabId={activeTab?.id}
        existingBookmark={existingBookmark}
        canBookmark={canBookmark}
      >
      {/* 标签栏 */}
      <div
        ref={tabBarRef}
        style={
          {
            height: TAB_BAR_HEIGHT,
            display: "flex",
            alignItems: "flex-end",
            paddingLeft: 80 /* 给 macOS 红绿灯让位 */,
            paddingRight: 8,
            position: "relative",
            overflow: "hidden",
            WebkitAppRegion: "drag",
          } as React.CSSProperties
        }
      >
        {/* 全屏时显示自定义红绿灯按钮（原生红绿灯被 macOS 收进自动隐藏栏） */}
        {isFullscreen && (
          <div
            style={
              {
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 80,
                display: "flex",
                alignItems: "center",
                paddingLeft: 12,
                gap: 7,
                WebkitAppRegion: "no-drag",
              } as React.CSSProperties
            }
          >
            <TrafficDot
              color="#ff5f57"
              hoverColor="#ff3b30"
              title="关闭窗口"
              onClick={() => ipcRenderer.send(BrowserWindowEvent.BROWSER_WINDOW_CLOSE_WINDOW)}
            />
            <TrafficDot
              color="#febc2e"
              hoverColor="#ff9500"
              title="最小化"
              onClick={() => ipcRenderer.send(BrowserWindowEvent.BROWSER_WINDOW_MINIMIZE)}
            />
            <TrafficDot
              color="#28c840"
              hoverColor="#34c759"
              title="退出全屏"
              onClick={() => ipcRenderer.send(BrowserWindowEvent.BROWSER_WINDOW_EXIT_FULLSCREEN)}
            />
          </div>
        )}
        {state.tabs.map((tab, idx) => {
          const isActive = tab.id === state.activeTabId;
          const isDragging = drag?.tabId === tab.id;
          const translateX =
            isDragging && drag ? Math.min(Math.max(drag.currentX - drag.startX, -4000), 4000) : 0;
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              onMouseDown={(e) => onTabMouseDown(e, tab, idx)}
              onAuxClick={(e) => {
                if (e.button === 1) onClose(tab.id);
              }}
              style={
                {
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
                } as React.CSSProperties
              }
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
          style={
            {
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
            } as React.CSSProperties
          }
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
          height: ADDRESS_ROW_HEIGHT,
          background: "#ffffff",
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          gap: 4,
          // borderBottom: "1px solid #e0e0e0",
          overflow: "visible",
          position: "relative",
        }}
      >
        <NavButton
          title="后退"
          disabled={!activeTab?.canGoBack}
          onClick={() => ipcRenderer.send(BrowserTabEvent.BROWSER_TAB_BACK)}
        >
          ‹
        </NavButton>
        <NavButton
          title="前进"
          disabled={!activeTab?.canGoForward}
          onClick={() => ipcRenderer.send(BrowserTabEvent.BROWSER_TAB_FORWARD)}
        >
          ›
        </NavButton>
        <NavButton title="刷新" onClick={() => ipcRenderer.send(BrowserTabEvent.BROWSER_TAB_RELOAD)}>
          ⟳
        </NavButton>
        <div
          style={{
            flex: 1,
            position: "relative",
            marginLeft: 4,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: editing ? "#ffffff" : "#f1f3f4",
              borderRadius: 18,
              height: 28,
              padding: "0 12px",
              border: editing ? "1px solid #1a73e8" : "1px solid transparent",
              boxSizing: "border-box",
              transition: "background 0.1s, border-color 0.1s",
            }}
          >
            <input
              ref={addressInputRef}
              value={address}
              onChange={handleAddressChange}
              onFocus={() => setEditing(true)}
              onBlur={(e) => {
                const rt = e.relatedTarget;
                if (rt instanceof Element && rt.closest("[data-bookmark-star-wrap]")) return;
                setEditing(false);
                setAddress(tabUrlForAddressBarDisplay(activeTab?.url ?? ""));
              }}
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
        </div>

        <BookmarkChromeStar />
      </div>

      <BookmarkChromeBarRow />
      </BookmarkChromeProvider>
      <div style={{
        height:1,
        background: "var(--ant-color-border-primary)",
      }}></div>
    </div>
  );
}

interface TrafficDotProps {
  color: string;
  hoverColor: string;
  title: string;
  onClick: () => void;
}
function TrafficDot({ color, hoverColor, title, onClick }: TrafficDotProps): React.JSX.Element {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 12,
        height: 12,
        borderRadius: 6,
        background: hovered ? hoverColor : color,
        cursor: "pointer",
        flexShrink: 0,
        transition: "background 0.1s",
      }}
    />
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
