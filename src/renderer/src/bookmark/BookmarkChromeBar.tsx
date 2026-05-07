import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  StarFilled,
  StarOutlined,
  FolderOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FolderAddOutlined,
} from "@ant-design/icons";
import { Button, ConfigProvider, Form, Input, Menu, Modal, Popover, Space, Typography, theme } from "antd";
import type { MenuProps } from "antd";
import { VS_GO_EVENT } from "../../../common/EVENT";
import { BROWSER_CHROME_HEIGHT, type BrowserItem } from "../../../common/type";
import { generateId } from "../../../common/utils";
import {
  flattenFolderChildrenPreorder,
  moveParentTargets,
  orderedRootBarItems,
  isNodeInsideFolderSubtree,
} from "./bookmarkUtils";

const { ipcRenderer } = window.electron;
const { Text } = Typography;

const CHROME_FLOATING_BUFFER = 12;
const SUGGESTION_ITEM_HEIGHT = 48;
const SUGGESTION_VISIBLE_ITEMS = 5;
const SUGGESTION_CHROME_BUFFER = 12;

type BookmarkBarMenuState =
  | { kind: "item"; x: number; y: number; item: BrowserItem }
  | { kind: "blank"; x: number; y: number }
  | null;

type NameDialogState =
  | { kind: "rename"; item: BrowserItem; draft: string }
  | { kind: "newFolder"; parentId: string | null; draft: string }
  | null;

interface BookmarkChromeContextValue {
  suggestionsRef: React.RefObject<HTMLDivElement | null>;
  showSuggestions: boolean;
  suggestionsLength: number;
  bookmarks: BrowserItem[];
  onBookmarksUpdated: () => Promise<void>;
  submitAddress: (mode: "current" | "new", url?: string) => void;
  bookmarkTargetUrl: string;
  activeTabTitle: string;
  activeTabId: string | null | undefined;
  existingBookmark: BrowserItem | undefined;
  canBookmark: boolean;
  starPopoverWrapRef: React.RefObject<HTMLDivElement | null>;
  bookmarkStarPopoverRef: React.RefObject<HTMLDivElement | null>;
  folderPanelRef: React.RefObject<HTMLDivElement | null>;
  bookmarkCtxMenuRef: React.RefObject<HTMLDivElement | null>;
  nameDialogCardRef: React.RefObject<HTMLDivElement | null>;
  bookmarkPopoverOpen: boolean;
  setBookmarkPopoverOpen: (v: boolean) => void;
  bookmarkDraftName: string;
  setBookmarkDraftName: (v: string) => void;
  folderDropdown: { folderId: string; x: number; y: number } | null;
  setFolderDropdown: React.Dispatch<
    React.SetStateAction<{ folderId: string; x: number; y: number } | null>
  >;
  bookmarkBarMenu: BookmarkBarMenuState;
  setBookmarkBarMenu: React.Dispatch<React.SetStateAction<BookmarkBarMenuState>>;
  nameDialog: NameDialogState;
  setNameDialog: React.Dispatch<React.SetStateAction<NameDialogState>>;
  initStarDraft: () => void;
  handleBookmarkSave: () => Promise<void>;
  handleBookmarkRemove: () => Promise<void>;
  moveItemToParent: (item: BrowserItem, parentId: string | null) => Promise<void>;
  deleteBrowserItem: (item: BrowserItem) => Promise<void>;
  commitNameDialog: () => Promise<void>;
}

const BookmarkChromeCtx = createContext<BookmarkChromeContextValue | null>(null);

function useBookmarkChrome(): BookmarkChromeContextValue {
  const v = useContext(BookmarkChromeCtx);
  if (!v) throw new Error("BookmarkChromeProvider missing");
  return v;
}

export interface BookmarkChromeProviderProps {
  suggestionsRef: React.RefObject<HTMLDivElement | null>;
  showSuggestions: boolean;
  suggestionsLength: number;
  bookmarks: BrowserItem[];
  onBookmarksUpdated: () => Promise<void>;
  submitAddress: (mode: "current" | "new", url?: string) => void;
  bookmarkTargetUrl: string;
  activeTabTitle: string;
  activeTabId: string | null | undefined;
  existingBookmark: BrowserItem | undefined;
  canBookmark: boolean;
  children: React.ReactNode;
}

export function BookmarkChromeProvider({
  suggestionsRef,
  showSuggestions,
  suggestionsLength,
  bookmarks,
  onBookmarksUpdated,
  submitAddress,
  bookmarkTargetUrl,
  activeTabTitle,
  activeTabId,
  existingBookmark,
  canBookmark,
  children,
}: BookmarkChromeProviderProps): React.JSX.Element {
  const [bookmarkPopoverOpen, setBookmarkPopoverOpen] = useState(false);
  const [bookmarkDraftName, setBookmarkDraftName] = useState("");
  const [folderDropdown, setFolderDropdown] = useState<{ folderId: string; x: number; y: number } | null>(
    null
  );
  const [bookmarkBarMenu, setBookmarkBarMenu] = useState<BookmarkBarMenuState>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);

  const starPopoverWrapRef = useRef<HTMLDivElement>(null);
  const bookmarkStarPopoverRef = useRef<HTMLDivElement>(null);
  const folderPanelRef = useRef<HTMLDivElement>(null);
  const bookmarkCtxMenuRef = useRef<HTMLDivElement>(null);
  const nameDialogCardRef = useRef<HTMLDivElement>(null);

  const flushChromePaddingFromOverlays = useCallback((): void => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        let maxBottom = 0;
        const nodes: (HTMLElement | null)[] = [
          suggestionsRef.current,
          folderPanelRef.current,
          bookmarkCtxMenuRef.current,
          bookmarkStarPopoverRef.current,
          nameDialogCardRef.current,
        ];
        for (const el of nodes) {
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          maxBottom = Math.max(maxBottom, r.bottom);
        }
        const measured = Math.max(0, maxBottom - BROWSER_CHROME_HEIGHT + CHROME_FLOATING_BUFFER);
        let fallback = 0;
        if (showSuggestions && suggestionsLength > 0) {
          fallback =
            Math.min(suggestionsLength, SUGGESTION_VISIBLE_ITEMS) * SUGGESTION_ITEM_HEIGHT +
            SUGGESTION_CHROME_BUFFER;
        }
        if (bookmarkBarMenu?.kind === "item") {
          const n = moveParentTargets(bookmarks, bookmarkBarMenu.item).length;
          fallback = Math.max(fallback, Math.min(280, 120 + n * 28));
        }
        ipcRenderer.send(VS_GO_EVENT.BROWSER_CHROME_SET_PADDING, Math.max(measured, fallback));
      });
    });
  }, [showSuggestions, suggestionsLength, suggestionsRef, bookmarkBarMenu, bookmarks]);

  useLayoutEffect(() => {
    flushChromePaddingFromOverlays();
    const onResize = (): void => {
      flushChromePaddingFromOverlays();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [
    flushChromePaddingFromOverlays,
    showSuggestions,
    suggestionsLength,
    folderDropdown,
    bookmarkBarMenu,
    bookmarkPopoverOpen,
    nameDialog,
    bookmarks,
  ]);

  useEffect(() => {
    return () => {
      ipcRenderer.send(VS_GO_EVENT.BROWSER_CHROME_SET_PADDING, 0);
    };
  }, []);

  useEffect(() => {
    setBookmarkPopoverOpen(false);
    setFolderDropdown(null);
    setBookmarkBarMenu(null);
    setNameDialog(null);
  }, [activeTabId]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent): void => {
      const t = e.target instanceof Node ? e.target : null;
      if (!t) return;

      if (starPopoverWrapRef.current?.contains(t)) return;
      if (bookmarkPopoverOpen) setBookmarkPopoverOpen(false);

      if (bookmarkCtxMenuRef.current?.contains(t)) return;
      if (folderPanelRef.current?.contains(t)) return;
      if (nameDialogCardRef.current?.contains(t)) return;

      setBookmarkBarMenu(null);
      setFolderDropdown(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [bookmarkPopoverOpen, bookmarkBarMenu, folderDropdown, nameDialog]);

  const initStarDraft = useCallback((): void => {
    const defaultName =
      existingBookmark?.name?.trim() ||
      activeTabTitle?.trim() ||
      (() => {
        try {
          return new URL(bookmarkTargetUrl).hostname;
        } catch {
          return bookmarkTargetUrl;
        }
      })();
    setBookmarkDraftName(defaultName || "书签");
  }, [existingBookmark, activeTabTitle, bookmarkTargetUrl]);

  const handleBookmarkSave = useCallback(async (): Promise<void> => {
    const name = bookmarkDraftName.trim();
    if (!name || !bookmarkTargetUrl) return;
    if (existingBookmark) {
      await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_UPDATE, {
        ...existingBookmark,
        name,
      } satisfies BrowserItem);
    } else {
      await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_ADD, {
        id: generateId(),
        name,
        url: bookmarkTargetUrl,
        type: "bookmark",
        parentId: null,
      } satisfies BrowserItem);
    }
    await onBookmarksUpdated();
    setBookmarkPopoverOpen(false);
  }, [bookmarkDraftName, bookmarkTargetUrl, existingBookmark, onBookmarksUpdated]);

  const handleBookmarkRemove = useCallback(async (): Promise<void> => {
    if (!existingBookmark) return;
    await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_REMOVE, existingBookmark.id);
    await onBookmarksUpdated();
    setBookmarkPopoverOpen(false);
  }, [existingBookmark, onBookmarksUpdated]);

  const moveItemToParent = useCallback(
    async (item: BrowserItem, parentId: string | null): Promise<void> => {
      if ((item.parentId ?? null) === (parentId ?? null)) {
        setBookmarkBarMenu(null);
        return;
      }
      if (item.type === "folder" && parentId !== null) {
        if (parentId === item.id || isNodeInsideFolderSubtree(bookmarks, parentId, item.id)) return;
      }
      if (parentId !== null) {
        const target = bookmarks.find((b) => b.id === parentId);
        if (!target || target.type !== "folder") return;
      }
      await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_UPDATE, {
        ...item,
        parentId,
      } satisfies BrowserItem);
      await onBookmarksUpdated();
      setBookmarkBarMenu(null);
    },
    [bookmarks, onBookmarksUpdated]
  );

  const deleteBrowserItem = useCallback(
    async (item: BrowserItem): Promise<void> => {
      await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_REMOVE, item.id);
      await onBookmarksUpdated();
      setBookmarkBarMenu(null);
      setFolderDropdown(null);
    },
    [onBookmarksUpdated]
  );

  const commitNameDialog = useCallback(async (): Promise<void> => {
    if (!nameDialog) return;
    if (nameDialog.kind === "rename") {
      const name = nameDialog.draft.trim();
      if (!name) return;
      await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_UPDATE, {
        ...nameDialog.item,
        name,
      } satisfies BrowserItem);
    } else {
      const name = nameDialog.draft.trim();
      if (!name) return;
      await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_ADD, {
        id: generateId(),
        name,
        type: "folder",
        parentId: nameDialog.parentId,
      } satisfies BrowserItem);
    }
    await onBookmarksUpdated();
    setNameDialog(null);
  }, [nameDialog, onBookmarksUpdated]);

  const value = useMemo(
    (): BookmarkChromeContextValue => ({
      suggestionsRef,
      showSuggestions,
      suggestionsLength,
      bookmarks,
      onBookmarksUpdated,
      submitAddress,
      bookmarkTargetUrl,
      activeTabTitle,
      activeTabId,
      existingBookmark,
      canBookmark,
      starPopoverWrapRef,
      bookmarkStarPopoverRef,
      folderPanelRef,
      bookmarkCtxMenuRef,
      nameDialogCardRef,
      bookmarkPopoverOpen,
      setBookmarkPopoverOpen,
      bookmarkDraftName,
      setBookmarkDraftName,
      folderDropdown,
      setFolderDropdown,
      bookmarkBarMenu,
      setBookmarkBarMenu,
      nameDialog,
      setNameDialog,
      initStarDraft,
      handleBookmarkSave,
      handleBookmarkRemove,
      moveItemToParent,
      deleteBrowserItem,
      commitNameDialog,
    }),
    [
      suggestionsRef,
      showSuggestions,
      suggestionsLength,
      bookmarks,
      onBookmarksUpdated,
      submitAddress,
      bookmarkTargetUrl,
      activeTabTitle,
      activeTabId,
      existingBookmark,
      canBookmark,
      bookmarkPopoverOpen,
      bookmarkDraftName,
      folderDropdown,
      bookmarkBarMenu,
      nameDialog,
      initStarDraft,
      handleBookmarkSave,
      handleBookmarkRemove,
      moveItemToParent,
      deleteBrowserItem,
      commitNameDialog,
    ]
  );

  return (
    <BookmarkChromeCtx.Provider value={value}>
      <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }} componentSize="small">
        {children}
        <style>
          {".tabbed-browser-chrome-root .vsgo-bookmark-bar-scroll{scrollbar-width:none;-ms-overflow-style:none}.tabbed-browser-chrome-root .vsgo-bookmark-bar-scroll::-webkit-scrollbar{display:none;height:0;width:0}"}
        </style>
      </ConfigProvider>
    </BookmarkChromeCtx.Provider>
  );
}

const getPopupContainer = (node: HTMLElement): HTMLElement =>
  (node.closest(".tabbed-browser-chrome-root") as HTMLElement) ?? document.body;

export function BookmarkChromeStar(): React.JSX.Element {
  const ctx = useBookmarkChrome();
  const starPopoverContent = (
    <div ref={ctx.bookmarkStarPopoverRef} style={{ width: 280 }}>
      <Text strong>{ctx.existingBookmark ? "修改书签" : "添加书签"}</Text>
      <Form layout="vertical" style={{ marginTop: 12 }} size="small">
        <Form.Item label="名称">
          <Input
            value={ctx.bookmarkDraftName}
            onChange={(e) => ctx.setBookmarkDraftName(e.target.value)}
            onPressEnter={() => void ctx.handleBookmarkSave()}
            placeholder="书签名称"
            allowClear
          />
        </Form.Item>
        <Text type="secondary" style={{ fontSize: 12, wordBreak: "break-all", display: "block" }}>
          {ctx.bookmarkTargetUrl}
        </Text>
        <Space style={{ marginTop: 12, justifyContent: "flex-end", width: "100%" }} wrap>
          {ctx.existingBookmark && (
            <Button danger type="link" size="small" onClick={() => void ctx.handleBookmarkRemove()}>
              删除
            </Button>
          )}
          <Button type="primary" size="small" onClick={() => void ctx.handleBookmarkSave()}>
            完成
          </Button>
        </Space>
      </Form>
    </div>
  );

  return (
    <div
      ref={ctx.starPopoverWrapRef}
      data-bookmark-star-wrap
      style={
        {
          position: "relative",
          flexShrink: 0,
          WebkitAppRegion: "no-drag",
        } as React.CSSProperties
      }
    >
      <Popover
        open={ctx.bookmarkPopoverOpen}
        onOpenChange={(open) => {
          if (!ctx.canBookmark) {
            if (open) return;
            ctx.setBookmarkPopoverOpen(false);
            return;
          }
          if (open) ctx.initStarDraft();
          ctx.setBookmarkPopoverOpen(open);
        }}
        trigger="click"
        placement="bottomRight"
        getPopupContainer={(node) => getPopupContainer(node)}
        content={starPopoverContent}
        destroyOnHidden
      >
        <Button
          type="text"
          size="small"
          disabled={!ctx.canBookmark}
          icon={
            ctx.existingBookmark ? <StarFilled style={{ color: "#1677ff" }} /> : <StarOutlined />
          }
          onMouseDown={(e) => e.preventDefault()}
          title={ctx.existingBookmark ? "已加入书签 — 点击编辑" : "为此页添加书签"}
          tabIndex={-1}
          style={{ width: 36, height: 28 }}
        />
      </Popover>
    </div>
  );
}

export function BookmarkChromeBarRow(): React.JSX.Element {
  const ctx = useBookmarkChrome();
  const rootBarItems = useMemo(() => orderedRootBarItems(ctx.bookmarks), [ctx.bookmarks]);

  const folderMenuItems: MenuProps["items"] = useMemo(() => {
    if (!ctx.folderDropdown) return [];
    return flattenFolderChildrenPreorder(ctx.bookmarks, ctx.folderDropdown.folderId, 0).map(
      ({ item, depth }) => {
        if (item.type === "folder") {
          return {
            key: item.id,
            label: (
              <span style={{ paddingLeft: depth * 10, color: "var(--ant-color-text-secondary)" }}>
                <FolderOutlined style={{ marginRight: 6 }} />
                {item.name}
              </span>
            ),
            disabled: true,
          };
        }
        return {
          key: item.id,
          label: <span style={{ paddingLeft: depth * 10 }}>{item.name}</span>,
          onClick: () => {
            if (item.url) ctx.submitAddress("current", item.url);
            ctx.setFolderDropdown(null);
          },
        };
      }
    );
  }, [ctx.folderDropdown, ctx.bookmarks, ctx.submitAddress, ctx.setFolderDropdown]);

  const contextMenuItems = useMemo((): MenuProps["items"] => {
    if (!ctx.bookmarkBarMenu || ctx.bookmarkBarMenu.kind === "blank") return [];
    const item = ctx.bookmarkBarMenu.item;
    const targets = moveParentTargets(ctx.bookmarks, item);
    const moveGroup: MenuProps["items"] = targets.map((t) => ({
      key: `to-${t.id ?? "root"}`,
      label: t.name,
      onClick: () => void ctx.moveItemToParent(item, t.id),
    }));
    const items: MenuProps["items"] = [
      {
        key: "rename",
        label: "重命名…",
        icon: <EditOutlined />,
        onClick: () => {
          ctx.setBookmarkBarMenu(null);
          ctx.setNameDialog({ kind: "rename", item, draft: item.name });
        },
      },
    ];
    if (item.type === "folder") {
      items.push({
        key: "subfolder",
        label: "在此文件夹内新建子文件夹…",
        icon: <FolderAddOutlined />,
        onClick: () => {
          ctx.setBookmarkBarMenu(null);
          ctx.setNameDialog({ kind: "newFolder", parentId: item.id, draft: "新文件夹" });
        },
      });
    }
    items.push(
      { type: "divider" },
      { type: "group", label: "移动到", children: moveGroup },
      { type: "divider" },
      {
        key: "delete",
        label: item.type === "folder" ? "删除文件夹…" : "删除",
        danger: true,
        icon: <DeleteOutlined />,
        onClick: () => {
          ctx.setBookmarkBarMenu(null);
          void ctx.deleteBrowserItem(item);
        },
      }
    );
    return items;
  }, [ctx.bookmarkBarMenu, ctx.bookmarks, ctx.moveItemToParent, ctx.setBookmarkBarMenu, ctx.setNameDialog, ctx.deleteBrowserItem]);

  return (
    <>
      <div
        className="vsgo-bookmark-bar-scroll tabbed-browser-bookmark-bar"
        onScroll={() => ctx.setFolderDropdown(null)}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest("[data-bookmark-chip]")) return;
          e.preventDefault();
          ctx.setFolderDropdown(null);
          ctx.setBookmarkBarMenu({ kind: "blank", x: e.clientX, y: e.clientY });
        }}
        style={
          {
            height: 28,
            minHeight: 28,
            background: "#fff",
            borderBottom: "1px solid var(--ant-color-border-secondary)",
            display: "flex",
            alignItems: "center",
            padding: "0 8px",
            gap: 4,
            overflowX: "auto",
            overflowY: "hidden",
            flexShrink: 0,
            WebkitAppRegion: "no-drag",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          } as React.CSSProperties
        }
      >
        {rootBarItems.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 12, paddingLeft: 6, userSelect: "none" }}>
            {ctx.bookmarks.length === 0
              ? "点击星标添加书签；空白处右键新建文件夹"
              : "书签均在文件夹内；空白处右键新建文件夹"}
          </Text>
        ) : (
          rootBarItems.map((item) =>
            item.type === "folder" ? (
              <Button
                key={item.id}
                data-bookmark-chip
                size="small"
                type={ctx.folderDropdown?.folderId === item.id ? "link" : "text"}
                icon={<FolderOutlined />}

                onMouseDown={(e) => {
                  if (e.button === 0) e.preventDefault();
                }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  ctx.setFolderDropdown((prev) =>
                    prev?.folderId === item.id ? null : { folderId: item.id, x: rect.left, y: rect.bottom }
                  );
                }}
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  ctx.setFolderDropdown(null);
                  ctx.setBookmarkBarMenu({ kind: "item", x: ev.clientX, y: ev.clientY, item });
                }}
              >
                {item.name}
              </Button>
            ) : (
              <Button
                key={item.id}
                data-bookmark-chip
                type="text"
                size="small"
                style={{ maxWidth: 160 }}
                title={`${item.name}\n${item.url ?? ""}`}
                onMouseDown={(e) => {
                  if (e.button === 0) e.preventDefault();
                }}
                onClick={() => {
                  if (item.url) ctx.submitAddress("current", item.url);
                }}
                onAuxClick={(e) => {
                  if (e.button === 1 && item.url) {
                    e.preventDefault();
                    ctx.submitAddress("new", item.url);
                  }
                }}
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  ctx.setFolderDropdown(null);
                  ctx.setBookmarkBarMenu({ kind: "item", x: ev.clientX, y: ev.clientY, item });
                }}
              >
                {item.name}
              </Button>
            )
          )
        )}
      </div>

      {ctx.folderDropdown && (
        <div
          ref={ctx.folderPanelRef}
          className="vsgo-bookmark-bar-scroll"
          style={{
            position: "fixed",
            left: Math.max(8, Math.min(ctx.folderDropdown.x, window.innerWidth - 220)),
            top: ctx.folderDropdown.y + 2,
            minWidth: 200,
            maxWidth: 320,
            maxHeight: 360,
            overflowY: "auto",
            overflowX: "hidden",
            background: "#fff",
            borderRadius: 8,
            boxShadow: "var(--ant-box-shadow-secondary)",
            zIndex: 1050,
            padding: "4px 0",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          <Menu
            mode="vertical"
            selectable={false}
            items={folderMenuItems}
            style={{ border: "none", boxShadow: "none" }}
          />
        </div>
      )}

      {ctx.bookmarkBarMenu && (
        <div
          ref={ctx.bookmarkCtxMenuRef}
          style={{
            position: "fixed",
            left: Math.min(ctx.bookmarkBarMenu.x, window.innerWidth - 240),
            top: Math.min(ctx.bookmarkBarMenu.y, window.innerHeight - 240),
            zIndex: 1060,
            minWidth: 200,
            maxWidth: 280,
            maxHeight: 320,
            overflowY: "auto",
            boxShadow: "var(--ant-box-shadow-secondary)",
            borderRadius: 8,
            background: "#fff",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {ctx.bookmarkBarMenu.kind === "blank" ? (
            <Menu
              selectable={false}
              style={{ border: "none" }}
              items={[
                {
                  key: "nf",
                  label: "新建文件夹…",
                  icon: <PlusOutlined />,
                  onClick: () => {
                    ctx.setBookmarkBarMenu(null);
                    ctx.setNameDialog({ kind: "newFolder", parentId: null, draft: "新文件夹" });
                  },
                },
              ]}
            />
          ) : (
            <Menu selectable={false} style={{ border: "none" }} items={contextMenuItems} />
          )}
        </div>
      )}

      <Modal
        title={ctx.nameDialog?.kind === "rename" ? "重命名" : "新建文件夹"}
        open={!!ctx.nameDialog}
        onOk={() => void ctx.commitNameDialog()}
        onCancel={() => ctx.setNameDialog(null)}
        okText="确定"
        cancelText="取消"
        destroyOnHidden
        getContainer={() => getPopupContainer(document.querySelector(".tabbed-browser-chrome-root") as HTMLElement)}
        zIndex={1100}
      >
        <div ref={ctx.nameDialogCardRef}>
          <Input
            value={ctx.nameDialog?.draft ?? ""}
            onChange={(e) =>
              ctx.setNameDialog((prev) => (prev ? { ...prev, draft: e.target.value } : prev))
            }
            onPressEnter={() => void ctx.commitNameDialog()}
            placeholder={ctx.nameDialog?.kind === "rename" ? "名称" : "文件夹名称"}
            allowClear
            autoFocus
          />
        </div>
      </Modal>
    </>
  );
}
