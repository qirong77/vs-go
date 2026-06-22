import { useEffect, useRef, useState } from "react";
import type { MouseEventHandler } from "react";
import { ConfigProvider, Input, Menu, theme } from "antd";
import type { InputRef, MenuProps } from "antd";
import {
  FolderOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FolderAddOutlined,
  StarFilled,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { BrowserOverlayEvent } from "../events";
import type { BrowserItem, OverlayType } from "@shared/type";
import { getOverlayContentInset } from "@shared/type";
import { OVERLAY_STYLES } from "./FloatingOverlay.styles";
import HistoryListOverlay from "./HistoryListOverlay";
import type { HistoryListData } from "./HistoryListOverlay";

const { ipcRenderer } = window.electron;

interface OverlayContentPayload {
  type: OverlayType;
  data: unknown;
}

function sendAction(action: Record<string, unknown>): void {
  ipcRenderer.send(BrowserOverlayEvent.BROWSER_OVERLAY_ACTION, action);
}

function useSyncedDraft(
  initialValue: string
): [string, React.Dispatch<React.SetStateAction<string>>] {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  return [value, setValue];
}

function useAutoSelectInput(inputRef: React.RefObject<InputRef | null>): void {
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.input?.select();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [inputRef]);
}

function preventDefaultThen(action: () => void): MouseEventHandler<HTMLButtonElement> {
  return (event) => {
    event.preventDefault();
    action();
  };
}

// ============================================================
// Bookmark Star
// ============================================================

interface BookmarkStarData {
  existingBookmark?: BrowserItem;
  bookmarkTargetUrl: string;
  draftName: string;
}

function BookmarkStarOverlay({ data }: { data: BookmarkStarData }): React.JSX.Element {
  const [name, setName] = useSyncedDraft(data.draftName);
  const inputRef = useRef<InputRef>(null);
  useAutoSelectInput(inputRef);

  const hasExisting = !!data.existingBookmark;
  const trimmed = name.trim();
  const save = (): void => {
    if (!trimmed) return;
    sendAction({ action: "save-bookmark", name: trimmed });
  };

  return (
    <div className="vsgo-overlay-panel" style={{ width: 272 }}>
      <div className="vsgo-overlay-header">
        <StarFilled className="vsgo-overlay-header-icon" />
        <span>{hasExisting ? "编辑书签" : "添加书签"}</span>
      </div>
      <Input
        ref={inputRef}
        className="vsgo-bookmark-name-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onPressEnter={save}
        placeholder="书签名称"
        allowClear
        autoFocus
        size="small"
      />
      <div className="vsgo-bookmark-url" title={data.bookmarkTargetUrl}>
        {data.bookmarkTargetUrl}
      </div>
      <div className="vsgo-overlay-footer">
        {hasExisting ? (
          <button
            type="button"
            className="vsgo-overlay-btn vsgo-overlay-btn-danger"
            onMouseDown={preventDefaultThen(() => sendAction({ action: "remove-bookmark" }))}
          >
            删除
          </button>
        ) : null}
        <div className="vsgo-overlay-footer-spacer" />
        <button
          type="button"
          className="vsgo-overlay-btn vsgo-overlay-btn-primary"
          disabled={!trimmed}
          onMouseDown={preventDefaultThen(save)}
        >
          完成
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Folder Dropdown
// ============================================================

interface FolderItemData {
  id: string;
  name: string;
  type: "bookmark" | "folder";
  depth: number;
  url?: string;
}

interface FolderDropdownData {
  items: FolderItemData[];
  overlayX: number;
  overlayY: number;
}

function openModeFromMouseEvent(e: React.MouseEvent | React.KeyboardEvent): "current" | "new" {
  return e.metaKey || e.ctrlKey ? "new" : "current";
}

function FolderDropdownOverlay({ data }: { data: FolderDropdownData }): React.JSX.Element {
  const handleContextMenu = (e: React.MouseEvent, item: FolderItemData): void => {
    e.preventDefault();
    e.stopPropagation();
    sendAction({
      action: "show-item-context-menu",
      itemId: item.id,
      x: e.clientX,
      y: e.clientY,
      overlayX: data.overlayX,
      overlayY: data.overlayY,
    });
  };

  const items: MenuProps["items"] =
    data.items.length === 0
      ? [
          {
            key: "empty",
            label: "空文件夹",
            disabled: true,
          },
        ]
      : data.items.map((item) => {
          const indent = item.depth * 12;
          if (item.type === "folder") {
            return {
              key: item.id,
              label: (
                <span
                  className="vsgo-folder-label"
                  style={{ paddingLeft: indent }}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                >
                  <FolderOutlined />
                  {item.name}
                </span>
              ),
              disabled: true,
            };
          }
          return {
            key: item.id,
            label: (
              <span
                className="vsgo-bookmark-item-label"
                style={{ paddingLeft: indent }}
                onContextMenu={(e) => handleContextMenu(e, item)}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    sendAction({ action: "select-folder-item", url: item.url, mode: "new" });
                  }
                }}
              >
                {item.name}
              </span>
            ),
            onClick: (info) =>
              sendAction({
                action: "select-folder-item",
                url: item.url,
                mode: openModeFromMouseEvent(info.domEvent),
              }),
          };
        });

  return (
    <Menu
      className="vsgo-overlay-menu"
      mode="vertical"
      selectable={false}
      items={items}
      style={{ border: "none", boxShadow: "none", minWidth: 180, maxWidth: 280 }}
    />
  );
}

// ============================================================
// Context Menu
// ============================================================

interface MoveTarget {
  id: string | null;
  name: string;
}

interface ContextMenuData {
  kind: "item" | "blank";
  item?: BrowserItem;
  targets: MoveTarget[];
}

function ContextMenuOverlay({ data }: { data: ContextMenuData }): React.JSX.Element {
  if (data.kind === "blank") {
    return (
      <Menu
        className="vsgo-overlay-menu"
        selectable={false}
        style={{ border: "none", minWidth: 180 }}
        items={[
          {
            key: "nf",
            label: "新建文件夹…",
            icon: <PlusOutlined />,
            onClick: () => sendAction({ action: "new-folder", parentId: null }),
          },
        ]}
      />
    );
  }

  const item = data.item!;
  const moveItems: MenuProps["items"] = data.targets.map((t) => ({
    key: `to-${t.id ?? "root"}`,
    label: t.name,
    onClick: () => sendAction({ action: "move-item", parentId: t.id }),
  }));

  const items: MenuProps["items"] = [];

  if (item.type === "bookmark" && item.url) {
    items.push(
      {
        key: "open",
        label: "打开",
        onClick: () => sendAction({ action: "open-item", itemId: item.id, mode: "current" }),
      },
      {
        key: "open-new",
        label: "在新标签页打开",
        onClick: () => sendAction({ action: "open-item", itemId: item.id, mode: "new" }),
      },
      { type: "divider" }
    );
  }

  items.push({
    key: "rename",
    label: "重命名…",
    icon: <EditOutlined />,
    onClick: () => sendAction({ action: "rename-item", itemId: item.id, itemName: item.name }),
  });

  if (item.type === "folder") {
    items.push({
      key: "subfolder",
      label: "在此文件夹内新建子文件夹…",
      icon: <FolderAddOutlined />,
      onClick: () => sendAction({ action: "new-folder", parentId: item.id }),
    });
  }

  items.push(
    { type: "divider" },
    { type: "group", label: "移动到", children: moveItems },
    { type: "divider" },
    {
      key: "delete",
      label: item.type === "folder" ? "删除文件夹及内容…" : "删除",
      danger: true,
      icon: <DeleteOutlined />,
      onClick: () => sendAction({ action: "delete-item", itemId: item.id }),
    }
  );

  return (
    <Menu
      className="vsgo-overlay-menu"
      selectable={false}
      style={{ border: "none", minWidth: 180, maxWidth: 260, maxHeight: 292 }}
      items={items}
    />
  );
}

// ============================================================
// Confirm Dialog
// ============================================================

interface ConfirmDialogData {
  kind: "delete";
  itemId: string;
  title: string;
  message: string;
  confirmText: string;
}

function ConfirmDialogOverlay({ data }: { data: ConfirmDialogData }): React.JSX.Element {
  return (
    <div className="vsgo-overlay-panel" style={{ width: 320 }}>
      <div className="vsgo-overlay-header">
        <ExclamationCircleOutlined style={{ color: "#d93025" }} />
        <span>{data.title}</span>
      </div>
      <div className="vsgo-confirm-message">{data.message}</div>
      <div className="vsgo-overlay-footer">
        <div className="vsgo-overlay-footer-spacer" />
        <button
          type="button"
          className="vsgo-overlay-btn vsgo-overlay-btn-ghost"
          onMouseDown={preventDefaultThen(() => sendAction({ action: "cancel-confirm" }))}
        >
          取消
        </button>
        <button
          type="button"
          className="vsgo-overlay-btn vsgo-overlay-btn-danger"
          onMouseDown={preventDefaultThen(() =>
            sendAction({ action: "confirm-delete", itemId: data.itemId })
          )}
        >
          {data.confirmText}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Name Dialog
// ============================================================

interface NameDialogData {
  kind: "rename" | "newFolder";
  draft: string;
  itemName?: string;
}

function NameDialogOverlay({ data }: { data: NameDialogData }): React.JSX.Element {
  const [name, setName] = useSyncedDraft(data.draft);
  const inputRef = useRef<InputRef>(null);
  const title = data.kind === "rename" ? "重命名" : "新建文件夹";
  useAutoSelectInput(inputRef);

  const trimmed = name.trim();
  const commit = (): void => {
    if (!trimmed) return;
    sendAction({ action: "commit-name", name: trimmed });
  };

  return (
    <div className="vsgo-overlay-panel" style={{ width: 320 }}>
      <div className="vsgo-name-dialog-title">{title}</div>
      <Input
        ref={inputRef}
        className="vsgo-bookmark-name-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onPressEnter={commit}
        placeholder={data.kind === "rename" ? "名称" : "文件夹名称"}
        allowClear
        autoFocus
        size="small"
      />
      <div className="vsgo-overlay-footer">
        <div className="vsgo-overlay-footer-spacer" />
        <button
          type="button"
          className="vsgo-overlay-btn vsgo-overlay-btn-ghost"
          onMouseDown={preventDefaultThen(() => sendAction({ action: "close-name-dialog" }))}
        >
          取消
        </button>
        <button
          type="button"
          className="vsgo-overlay-btn vsgo-overlay-btn-primary"
          disabled={!trimmed}
          onMouseDown={preventDefaultThen(commit)}
        >
          确定
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Main Overlay
// ============================================================

function isInteractiveOverlayTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(
    "button, .vsgo-history-item, .ant-menu-item:not(.ant-menu-item-disabled), .ant-input-clear-icon, [role='menuitem']"
  );
}

export default function FloatingOverlay(): React.JSX.Element {
  const [content, setContent] = useState<OverlayContentPayload | null>(null);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      document.documentElement.style.background = "";
      document.body.style.background = "";
    };
  }, []);

  // Electron 透明无边框窗口在 macOS 上常不应用 CSS cursor，需同步到 body
  useEffect(() => {
    if (!content) return;
    const onMove = (e: MouseEvent): void => {
      document.body.style.cursor = isInteractiveOverlayTarget(e.target) ? "pointer" : "default";
    };
    const onLeave = (): void => {
      document.body.style.cursor = "default";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.body.style.cursor = "";
    };
  }, [content]);

  useEffect(() => {
    const handler = (_e: unknown, payload: OverlayContentPayload): void => {
      setContent(payload);
    };
    ipcRenderer.on(BrowserOverlayEvent.BROWSER_OVERLAY_CONTENT, handler);
    return () => {
      ipcRenderer.removeListener(BrowserOverlayEvent.BROWSER_OVERLAY_CONTENT, handler);
    };
  }, []);

  useEffect(() => {
    if (!content) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        sendAction({ action: "dismiss-overlay" });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [content]);

  if (!content) {
    return <div style={{ width: 1, height: 1 }} />;
  }

  const inset = getOverlayContentInset(content.type);

  const wrapStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: 6,
    boxShadow: "0 2px 10px rgba(0,0,0,0.1), 0 0 0 0.5px rgba(0,0,0,0.04)",
    pointerEvents: "auto",
    overflow: "hidden",
  };

  const handleRootPointerDownCapture = (e: React.PointerEvent<HTMLDivElement>): void => {
    const card = e.currentTarget.querySelector(".vsgo-overlay-card");
    if (card?.contains(e.target as Node)) return;
    sendAction({ action: "dismiss-overlay", refocusHost: content.type !== "history-list" });
  };

  let body: React.JSX.Element;

  switch (content.type) {
    case "bookmark-star":
      body = <BookmarkStarOverlay data={content.data as BookmarkStarData} />;
      break;
    case "folder-dropdown":
      body = <FolderDropdownOverlay data={content.data as FolderDropdownData} />;
      break;
    case "context-menu":
      body = <ContextMenuOverlay data={content.data as ContextMenuData} />;
      break;
    case "confirm-dialog":
      body = <ConfirmDialogOverlay data={content.data as ConfirmDialogData} />;
      break;
    case "name-dialog":
      body = <NameDialogOverlay data={content.data as NameDialogData} />;
      break;
    case "history-list":
      body = <HistoryListOverlay data={content.data as HistoryListData} onAction={sendAction} />;
      break;
    default:
      body = <div />;
  }

  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }} componentSize="small">
      <style>{OVERLAY_STYLES}</style>
      <div
        className="vsgo-overlay-root"
        onPointerDownCapture={handleRootPointerDownCapture}
        style={{
          width: "100vw",
          height: "100vh",
          boxSizing: "border-box",
          background: "transparent",
          padding: `${inset.top}px ${inset.right}px ${inset.bottom}px ${inset.left}px`,
        }}
      >
        <div className={`vsgo-overlay-card vsgo-overlay-card-${content.type}`} style={wrapStyle}>
          {body}
        </div>
      </div>
    </ConfigProvider>
  );
}
