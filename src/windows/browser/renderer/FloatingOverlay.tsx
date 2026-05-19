import { useEffect, useRef, useState } from "react";
import { ConfigProvider, Input, Menu, theme } from "antd";
import type { InputRef, MenuProps } from "antd";
import {
  FolderOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FolderAddOutlined,
  StarFilled,
} from "@ant-design/icons";
import { VS_GO_EVENT } from "@shared/EVENT";
import type { BrowserItem, OverlayType } from "@shared/type";
import { getOverlayContentInset } from "@shared/type";

const { ipcRenderer } = window.electron;

const OVERLAY_STYLES = `
  html, body, #root {
    cursor: default;
  }
  .vsgo-overlay-root {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }
  .vsgo-overlay-card {
    animation: vsgoOverlayIn 0.16s ease-out;
    cursor: default;
  }
  .vsgo-overlay-card button,
  .vsgo-overlay-card .ant-menu-item:not(.ant-menu-item-disabled),
  .vsgo-overlay-card .ant-menu-item:not(.ant-menu-item-disabled) .ant-menu-title-content,
  .vsgo-overlay-card .ant-menu-item:not(.ant-menu-item-disabled) .anticon {
    cursor: pointer !important;
  }
  @keyframes vsgoOverlayIn {
    from { opacity: 0; transform: translateY(-3px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .vsgo-overlay-panel {
    padding: 10px 12px 8px;
    min-width: 0;
  }
  .vsgo-overlay-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: #202124;
    margin-bottom: 8px;
    user-select: none;
  }
  .vsgo-overlay-header-icon {
    color: #f5b400;
    font-size: 14px;
  }
  .vsgo-bookmark-name-input.ant-input {
    border-radius: 6px;
    font-size: 12px;
  }
  .vsgo-bookmark-url {
    margin-top: 6px;
    padding: 4px 6px;
    font-size: 10px;
    line-height: 1.4;
    color: #5f6368;
    background: #f1f3f4;
    border-radius: 6px;
    word-break: break-all;
    user-select: text;
  }
  .vsgo-overlay-footer {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
  }
  .vsgo-overlay-footer-spacer {
    flex: 1;
  }
  .vsgo-overlay-btn {
    border: none;
    background: transparent;
    font-size: 12px;
    line-height: 1;
    padding: 4px 10px;
    border-radius: 5px;
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;
    user-select: none;
  }
  .vsgo-overlay-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  .vsgo-overlay-btn-danger {
    color: #d93025;
  }
  .vsgo-overlay-btn-danger:hover:not(:disabled) {
    background: #fce8e6;
  }
  .vsgo-overlay-btn-ghost {
    color: #5f6368;
  }
  .vsgo-overlay-btn-ghost:hover:not(:disabled) {
    background: #f1f3f4;
  }
  .vsgo-overlay-btn-primary {
    color: #fff;
    background: #1a73e8;
    font-weight: 500;
  }
  .vsgo-overlay-btn-primary:hover:not(:disabled) {
    background: #1765cc;
  }
  .vsgo-overlay-menu.ant-menu {
    padding: 2px;
    background: transparent;
  }
  .vsgo-overlay-menu.ant-menu .ant-menu-item,
  .vsgo-overlay-menu.ant-menu .ant-menu-submenu-title {
    cursor: pointer;
    border-radius: 4px;
    margin: 0;
    width: 100%;
    min-height: 28px;
    height: 28px;
    line-height: 28px;
    padding-inline: 8px !important;
    font-size: 12px;
    transition: background 0.12s ease;
  }
  .vsgo-overlay-menu.ant-menu .ant-menu-item-disabled {
    cursor: default;
  }
  .vsgo-overlay-menu.ant-menu .ant-menu-item-disabled:hover {
    background: transparent !important;
  }
  .vsgo-overlay-menu.ant-menu .ant-menu-item-group-title {
    font-size: 10px;
    color: #80868b;
    padding: 4px 8px 2px;
    line-height: 1.2;
  }
  .vsgo-overlay-menu.ant-menu .ant-menu-item-group-list {
    padding: 0;
  }
  .vsgo-overlay-menu.ant-menu .ant-menu-item-group-list .ant-menu-item {
    cursor: pointer;
  }
  .vsgo-folder-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #80868b;
    font-size: 12px;
    user-select: none;
  }
  .vsgo-bookmark-item-label {
    display: block;
    font-size: 12px;
    color: #202124;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 220px;
  }
  .vsgo-name-dialog-title {
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 8px;
    color: #202124;
    user-select: none;
  }
  .vsgo-overlay-panel .ant-input,
  .vsgo-overlay-panel .ant-input-affix-wrapper {
    cursor: text !important;
  }
  .vsgo-overlay-panel .ant-input-clear-icon {
    cursor: pointer !important;
  }
`;

interface OverlayContentPayload {
  type: OverlayType;
  data: unknown;
}

function sendAction(action: Record<string, unknown>): void {
  ipcRenderer.send(VS_GO_EVENT.BROWSER_OVERLAY_ACTION, action);
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
  const [name, setName] = useState(data.draftName);
  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    setName(data.draftName);
  }, [data.draftName]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.input?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

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
            onMouseDown={(e) => {
              e.preventDefault();
              sendAction({ action: "remove-bookmark" });
            }}
          >
            删除
          </button>
        ) : null}
        <div className="vsgo-overlay-footer-spacer" />
        <button
          type="button"
          className="vsgo-overlay-btn vsgo-overlay-btn-primary"
          disabled={!trimmed}
          onMouseDown={(e) => {
            e.preventDefault();
            save();
          }}
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
}

function FolderDropdownOverlay({ data }: { data: FolderDropdownData }): React.JSX.Element {
  const items: MenuProps["items"] = data.items.map((item) => {
    const indent = item.depth * 12;
    if (item.type === "folder") {
      return {
        key: item.id,
        label: (
          <span className="vsgo-folder-label" style={{ paddingLeft: indent }}>
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
        <span className="vsgo-bookmark-item-label" style={{ paddingLeft: indent }}>
          {item.name}
        </span>
      ),
      onClick: () => sendAction({ action: "select-folder-item", url: item.url }),
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

  const items: MenuProps["items"] = [
    {
      key: "rename",
      label: "重命名…",
      icon: <EditOutlined />,
      onClick: () => sendAction({ action: "rename-item", itemId: item.id, itemName: item.name }),
    },
  ];

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
      label: item.type === "folder" ? "删除文件夹…" : "删除",
      danger: true,
      icon: <DeleteOutlined />,
      onClick: () => sendAction({ action: "delete-item", itemId: item.id }),
    }
  );

  return (
    <Menu
      className="vsgo-overlay-menu"
      selectable={false}
      style={{ border: "none", minWidth: 180, maxWidth: 260 }}
      items={items}
    />
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
  const [name, setName] = useState(data.draft);
  const inputRef = useRef<InputRef>(null);
  const title = data.kind === "rename" ? "重命名" : "新建文件夹";

  useEffect(() => {
    setName(data.draft);
  }, [data.draft]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.input?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

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
          onMouseDown={(e) => {
            e.preventDefault();
            sendAction({ action: "close-name-dialog" });
          }}
        >
          取消
        </button>
        <button
          type="button"
          className="vsgo-overlay-btn vsgo-overlay-btn-primary"
          disabled={!trimmed}
          onMouseDown={(e) => {
            e.preventDefault();
            commit();
          }}
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
    "button, .ant-menu-item:not(.ant-menu-item-disabled), .ant-input-clear-icon, [role='menuitem']"
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
      document.body.style.cursor = isInteractiveOverlayTarget(e.target)
        ? "pointer"
        : "default";
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
    ipcRenderer.on(VS_GO_EVENT.BROWSER_OVERLAY_CONTENT, handler);
    return () => {
      ipcRenderer.removeListener(VS_GO_EVENT.BROWSER_OVERLAY_CONTENT, handler);
    };
  }, []);

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
    sendAction({ action: "dismiss-overlay" });
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
    case "name-dialog":
      body = <NameDialogOverlay data={content.data as NameDialogData} />;
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
        <div className="vsgo-overlay-card" style={wrapStyle}>
          {body}
        </div>
      </div>
    </ConfigProvider>
  );
}
