import { useEffect, useState } from "react";
import { ConfigProvider, Input, Button, Menu, Typography, theme, Form, Space } from "antd";
import type { MenuProps } from "antd";
import { FolderOutlined, PlusOutlined, EditOutlined, DeleteOutlined, FolderAddOutlined } from "@ant-design/icons";
import { VS_GO_EVENT } from "../../common/EVENT";
import type { BrowserItem, OverlayType } from "../../common/type";
import { getOverlayContentInset } from "../../common/type";

const { ipcRenderer } = window.electron;
const { Text } = Typography;

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

  useEffect(() => {
    setName(data.draftName);
  }, [data.draftName]);

  const hasExisting = !!data.existingBookmark;

  return (
    <div style={{ width: 300, padding: 16 }}>
      <Text strong>{hasExisting ? "修改书签" : "添加书签"}</Text>
      <Form layout="vertical" style={{ marginTop: 12 }} size="small">
        <Form.Item label="名称">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={() => sendAction({ action: "save-bookmark", name: name.trim() })}
            placeholder="书签名称"
            allowClear
            autoFocus
          />
        </Form.Item>
        <Text type="secondary" style={{ fontSize: 12, wordBreak: "break-all", display: "block" }}>
          {data.bookmarkTargetUrl}
        </Text>
        <Space style={{ marginTop: 12, justifyContent: "flex-end", width: "100%" }} wrap>
          {hasExisting && (
            <Button danger type="link" size="small" onMouseDown={(e) => { e.preventDefault(); sendAction({ action: "remove-bookmark" }); }}>
              删除
            </Button>
          )}
          <Button type="primary" size="small" onMouseDown={(e) => { e.preventDefault(); sendAction({ action: "save-bookmark", name: name.trim() }); }}>
            完成
          </Button>
        </Space>
      </Form>
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
    if (item.type === "folder") {
      return {
        key: item.id,
        label: (
          <span style={{ paddingLeft: item.depth * 10, color: "var(--ant-color-text-secondary)" }}>
            <FolderOutlined style={{ marginRight: 6 }} />
            {item.name}
          </span>
        ),
        disabled: true,
      };
    }
    return {
      key: item.id,
      label: <span style={{ paddingLeft: item.depth * 10 }}>{item.name}</span>,
      onClick: () => sendAction({ action: "select-folder-item", url: item.url }),
    };
  });

  return (
    <Menu
      mode="vertical"
      selectable={false}
      items={items}
      style={{ border: "none", boxShadow: "none", minWidth: 200, maxWidth: 320 }}
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
        selectable={false}
        style={{ border: "none", minWidth: 200 }}
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
      selectable={false}
      style={{ border: "none", minWidth: 200, maxWidth: 280 }}
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
  const title = data.kind === "rename" ? "重命名" : "新建文件夹";

  useEffect(() => {
    setName(data.draft);
  }, [data.draft]);

  return (
    <div style={{ width: 360, padding: "24px 24px 16px" }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16, color: "#202124" }}>{title}</div>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onPressEnter={() => { if (name.trim()) sendAction({ action: "commit-name", name: name.trim() }); }}
        placeholder={data.kind === "rename" ? "名称" : "文件夹名称"}
        allowClear
        autoFocus
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <Button size="small" onMouseDown={(e) => { e.preventDefault(); sendAction({ action: "close-name-dialog" }); }}>
          取消
        </Button>
        <Button type="primary" size="small" disabled={!name.trim()} onMouseDown={(e) => { e.preventDefault(); sendAction({ action: "commit-name", name: name.trim() }); }}>
          确定
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Main Overlay
// ============================================================

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
    borderRadius: 10,
    boxShadow: "0 8px 30px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)",
    pointerEvents: "auto",
    overflow: "hidden",
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
      <div
        style={{
          width: "100vw",
          height: "100vh",
          boxSizing: "border-box",
          background: "transparent",
          padding: `${inset.top}px ${inset.right}px ${inset.bottom}px ${inset.left}px`,
        }}
      >
        <div style={wrapStyle}>
          {body}
        </div>
      </div>
    </ConfigProvider>
  );
}
