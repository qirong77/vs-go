import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VS_GO_EVENT } from "../../common/EVENT";
import {
  BROWSER_CHROME_HEIGHT,
  tabUrlForAddressBarDisplay,
  type TabState,
  type TabbedBrowserState,
  type BrowserSuggestion,
} from "../../common/type";

const { ipcRenderer } = window.electron;

// 标签栏 32px + 地址栏 40px = 72px（必须与 common/type.ts BROWSER_CHROME_HEIGHT 一致）
const TAB_BAR_HEIGHT = 32;
const ADDRESS_BAR_HEIGHT = BROWSER_CHROME_HEIGHT - TAB_BAR_HEIGHT;
const TAB_MIN_WIDTH = 80;
const TAB_MAX_WIDTH = 220;
const ADDRESS_HISTORY_STORAGE_KEY = "vs-go.address-history";
const ADDRESS_HISTORY_MAX_COUNT = 100;
const ADDRESS_HISTORY_PREVIEW_COUNT = 8;

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
  const [suggestions, setSuggestions] = useState<BrowserSuggestion[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [addressHistory, setAddressHistory] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem(ADDRESS_HISTORY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((url): url is string => typeof url === "string")
        .map((url) => url.trim())
        .filter(Boolean)
        .slice(0, ADDRESS_HISTORY_MAX_COUNT);
    } catch {
      return [];
    }
  });
  const addressInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const addressHistoryRef = useRef<string[]>(addressHistory);
  /** 作废过期的地址建议请求，避免 blur / 切 tab 后仍回调 notifyChromePadding 把主进程留白撑开 */
  const suggestionsFetchGenRef = useRef(0);
  const [drag, setDrag] = useState<DragState | null>(null);

  const activeTab = useMemo<TabState | undefined>(
    () => state.tabs.find((t) => t.id === state.activeTabId),
    [state]
  );

  const addAddressToHistory = useCallback((rawUrl: string): void => {
    const url = rawUrl.trim();
    if (!url || url === "about:blank") return;
    setAddressHistory((prev) =>
      [url, ...prev.filter((item) => item !== url)].slice(0, ADDRESS_HISTORY_MAX_COUNT)
    );
  }, []);

  const openHistorySuggestions = useCallback((): void => {
    const list: BrowserSuggestion[] = addressHistoryRef.current
      .slice(0, ADDRESS_HISTORY_PREVIEW_COUNT)
      .map((url) => ({ url, title: url, type: "history" }));
    setSuggestions(list);
    setSuggestionIndex(list.length > 0 ? 0 : -1);
    setShowSuggestions(list.length > 0);
  }, []);

  // 初始拉取 state + 订阅更新
  useEffect(() => {
    ipcRenderer.invoke(VS_GO_EVENT.BROWSER_TAB_GET_STATE).then((s: TabbedBrowserState) => {
      setState(s);
    });
    const onUpdate = (_e: unknown, s: TabbedBrowserState): void => {
      setState(s);
    };
    const onFocusAddress = (): void => {
      console.log('onFocusAddress');
      setEditing(true);
      requestAnimationFrame(() => {
        addressInputRef.current?.focus();
        addressInputRef.current?.select();
        openHistorySuggestions();
      });
    };
    const onBlurAddress = (): void => {
      closeSuggestions();
      setEditing(false);
      addressInputRef.current?.blur();
    };
    ipcRenderer.on(VS_GO_EVENT.BROWSER_TAB_STATE_UPDATED, onUpdate);
    ipcRenderer.on(VS_GO_EVENT.BROWSER_TAB_FOCUS_ADDRESS, onFocusAddress);
    ipcRenderer.on(VS_GO_EVENT.BROWSER_TAB_BLUR_ADDRESS, onBlurAddress);
    return () => {
      ipcRenderer.removeListener(VS_GO_EVENT.BROWSER_TAB_STATE_UPDATED, onUpdate);
      ipcRenderer.removeListener(VS_GO_EVENT.BROWSER_TAB_FOCUS_ADDRESS, onFocusAddress);
      ipcRenderer.removeListener(VS_GO_EVENT.BROWSER_TAB_BLUR_ADDRESS, onBlurAddress);
    };
  }, []);

  // 当前 tab 变化 / URL 变化且未编辑时，同步 address bar（默认首页在栏内显示为空）
  useEffect(() => {
    if (!editing) {
      setAddress(tabUrlForAddressBarDisplay(activeTab?.url ?? ""));
    }
  }, [activeTab?.url, activeTab?.id, editing]);

  // 切换标签时收起建议并重置地址栏编辑态，避免上一标签的异步建议或 padding 状态泄漏
  useEffect(() => {
    closeSuggestions();
    setEditing(false);
  }, [activeTab?.id]);

  // 记录最近访问 URL（去重 + 最多 100 条）
  useEffect(() => {
    if (!activeTab?.url || activeTab.loading) return;
    addAddressToHistory(activeTab.url);
  }, [activeTab?.url, activeTab?.loading, addAddressToHistory]);

  // 持久化地址历史
  useEffect(() => {
    addressHistoryRef.current = addressHistory;
    try {
      window.localStorage.setItem(ADDRESS_HISTORY_STORAGE_KEY, JSON.stringify(addressHistory));
    } catch {
      // ignore
    }
  }, [addressHistory]);

  const SUGGESTION_ITEM_HEIGHT = 48;
  const SUGGESTION_VISIBLE_ITEMS = 5;
  // 额外缓冲：为下拉框的底部边框+圆角留出空间，避免被 WebContentsView 盖住
  const SUGGESTION_CHROME_BUFFER = 12;

  const notifyChromePadding = useCallback((count: number): void => {
    const extra =
      count > 0
        ? Math.min(count, SUGGESTION_VISIBLE_ITEMS) * SUGGESTION_ITEM_HEIGHT +
          SUGGESTION_CHROME_BUFFER
        : 0;
    ipcRenderer.send(VS_GO_EVENT.BROWSER_CHROME_SET_PADDING, extra);
  }, []);

  // 主进程留白与「是否展开建议」一致，避免异步 suggest 在关闭后仍把 chromeExtraHeight 顶上去
  useEffect(() => {
    const count = showSuggestions && suggestions.length > 0 ? suggestions.length : 0;
    notifyChromePadding(count);
  }, [showSuggestions, suggestions.length, notifyChromePadding]);

  // 获取地址栏建议
  const fetchSuggestions = useCallback(async (query: string): Promise<void> => {
    const gen = ++suggestionsFetchGenRef.current;
    const result: BrowserSuggestion[] = await ipcRenderer.invoke(
      VS_GO_EVENT.BROWSER_ADDRESS_SUGGESTIONS,
      query
    );
    if (gen !== suggestionsFetchGenRef.current) return;
    const list = result ?? [];
    setSuggestions(list);
    setSuggestionIndex(list.length > 0 ? 0 : -1);
  }, []);

  const closeSuggestions = useCallback((): void => {
    suggestionsFetchGenRef.current += 1;
    setShowSuggestions(false);
    setSuggestions([]);
    setSuggestionIndex(-1);
  }, []);

  // 地址栏操作
  const submitAddress = (mode: "current" | "new", overrideUrl?: string): void => {
    const url = (overrideUrl ?? address).trim();
    if (!url) return;
    ipcRenderer.send(VS_GO_EVENT.BROWSER_TAB_NAVIGATE, { url, mode });
    addressInputRef.current?.blur();
    setEditing(false);
    closeSuggestions();
  };

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = e.target.value;
    setAddress(val);
    if (!val.trim()) {
      openHistorySuggestions();
      return;
    }
    fetchSuggestions(val);
    setShowSuggestions(true);
  };

  const handleAddressKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSuggestionIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSuggestionIndex((prev) => Math.max(prev - 1, -1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestionIndex >= 0 && suggestions[suggestionIndex]) {
        submitAddress(e.shiftKey ? "new" : "current", suggestions[suggestionIndex].url);
      } else {
        submitAddress(e.shiftKey ? "new" : "current");
      }
      return;
    }
    if (e.key === "Escape") {
      setEditing(false);
      setAddress(tabUrlForAddressBarDisplay(activeTab?.url ?? ""));
      closeSuggestions();
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
    const availableWidth = barWidth - 40 /* 新建按钮 */ - 80; /* 红绿灯 */
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
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        overflow: "visible",
        background: "#dee1e6",
        position: "relative",
        zIndex: 100,
      }}
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
          height: ADDRESS_BAR_HEIGHT,
          background: "#ffffff",
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          gap: 4,
          borderBottom: "1px solid #e0e0e0",
          overflow: "visible",
          position: "relative",
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
        <NavButton title="刷新" onClick={() => ipcRenderer.send(VS_GO_EVENT.BROWSER_TAB_RELOAD)}>
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
              borderRadius: showSuggestions && suggestions.length > 0 ? "10px 10px 0 0" : 18,
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
              onFocus={() => {
                setEditing(true);
                openHistorySuggestions();
              }}
              onBlur={(e) => {
                // 如果点击的是建议项，不立即关闭
                if (suggestionsRef.current?.contains(e.relatedTarget as Node)) return;
                setEditing(false);
                closeSuggestions();
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

          {/* 建议下拉列表 */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              onMouseLeave={() => {
                if (suggestions.length > 0) setSuggestionIndex(0);
              }}
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                background: "#ffffff",
                border: "1px solid #1a73e8",
                borderTop: "none",
                borderRadius: "0 0 10px 10px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                zIndex: 1000,
                maxHeight: SUGGESTION_VISIBLE_ITEMS * SUGGESTION_ITEM_HEIGHT,
                overflowY: "scroll",
              }}
            >
              {suggestions.map((suggestion, idx) => (
                <div
                  key={suggestion.url}
                  tabIndex={-1}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    submitAddress("current", suggestion.url);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "8px 12px",
                    cursor: "pointer",
                    background: idx === suggestionIndex ? "#e8f0fe" : "transparent",
                    gap: 8,
                    flexShrink: 0,
                  }}
                  onMouseEnter={() => setSuggestionIndex(idx)}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: suggestion.type === "bookmark" ? "#1a73e8" : "#5f6368",
                      flexShrink: 0,
                      width: 14,
                      textAlign: "center",
                    }}
                  >
                    {suggestion.type === "bookmark" ? "★" : "🕐"}
                  </span>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: "#202124",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {suggestion.title}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#5f6368",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {suggestion.url}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
