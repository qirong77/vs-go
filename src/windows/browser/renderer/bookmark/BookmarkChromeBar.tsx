import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StarFilled, StarOutlined, FolderOutlined, FolderAddOutlined } from "@ant-design/icons";
import { Button, ConfigProvider, Typography, theme } from "antd";
import { BrowserOverlayEvent, BrowserSettingsEvent } from "../../events";
import { type BrowserItem, type OverlayBounds, type OverlayType } from "@shared/type";
import { generateId } from "@shared/utils";
import {
  flattenFolderChildrenPreorder,
  moveParentTargets,
  orderedRootBarItems,
  isNodeInsideFolderSubtree,
} from "./bookmarkUtils";

const { ipcRenderer } = window.electron;
const { Text } = Typography;

type BookmarkBarMenuState =
  | { kind: "item"; x: number; y: number; item: BrowserItem }
  | { kind: "blank"; x: number; y: number }
  | null;

type NameDialogState =
  | { kind: "rename"; item: BrowserItem; draft: string }
  | { kind: "newFolder"; parentId: string | null; draft: string }
  | null;

type ConfirmDialogState = { kind: "delete"; item: BrowserItem } | null;

const MENU_WIDTH = 220;
const CONTEXT_MENU_MAX_HEIGHT = 300;
const FOLDER_DROPDOWN_WIDTH = 220;
const FOLDER_DROPDOWN_MAX_HEIGHT = 320;
const OVERLAY_MARGIN = 8;

function clampOverlayBounds(x: number, y: number, width: number, height: number): OverlayBounds {
  const maxX = Math.max(OVERLAY_MARGIN, window.innerWidth - width - OVERLAY_MARGIN);
  const maxY = Math.max(OVERLAY_MARGIN, window.innerHeight - height - OVERLAY_MARGIN);
  return {
    x: Math.max(OVERLAY_MARGIN, Math.min(x, maxX)),
    y: Math.max(OVERLAY_MARGIN, Math.min(y, maxY)),
    width,
    height,
  };
}

function countFolderDescendants(items: BrowserItem[], folderId: string): number {
  let count = 0;
  const visit = (parentId: string): void => {
    for (const item of items) {
      if ((item.parentId ?? null) !== parentId) continue;
      count += 1;
      if (item.type === "folder") visit(item.id);
    }
  };
  visit(folderId);
  return count;
}

function getDefaultBookmarkName(
  existingBookmark: BrowserItem | undefined,
  activeTabTitle: string,
  bookmarkTargetUrl: string
): string {
  const title = existingBookmark?.name?.trim() || activeTabTitle?.trim();
  if (title) return title;

  try {
    return new URL(bookmarkTargetUrl).hostname || "书签";
  } catch {
    return bookmarkTargetUrl || "书签";
  }
}

type OverlayActionPayload = { action: string; [key: string]: unknown };

interface OverlayActionContext {
  handleBookmarkSave: (overlayName?: string) => Promise<void>;
  handleBookmarkRemove: () => Promise<void>;
  moveItemToParent: (item: BrowserItem, parentId: string | null) => Promise<void>;
  deleteBrowserItem: (item: BrowserItem) => Promise<void>;
  submitAddress: (mode: "current" | "new", url?: string) => void;
  showOverlay: (type: OverlayType, bounds: OverlayBounds, data: unknown) => void;
  hideOverlay: () => void;
  bookmarks: BrowserItem[];
  bookmarkBarMenu: BookmarkBarMenuState;
  onBookmarksUpdated: () => Promise<void>;
  setBookmarkDraftName: (v: string) => void;
  setBookmarkPopoverOpen: (v: boolean) => void;
  setBookmarkBarMenu: React.Dispatch<React.SetStateAction<BookmarkBarMenuState>>;
  setFolderDropdown: React.Dispatch<
    React.SetStateAction<{ folderId: string; x: number; y: number } | null>
  >;
  setNameDialog: React.Dispatch<React.SetStateAction<NameDialogState>>;
  setConfirmDialog: React.Dispatch<React.SetStateAction<ConfirmDialogState>>;
}

function closeAllBookmarkOverlays(ctx: OverlayActionContext): void {
  ctx.setBookmarkPopoverOpen(false);
  ctx.setBookmarkBarMenu(null);
  ctx.setFolderDropdown(null);
  ctx.setNameDialog(null);
  ctx.setConfirmDialog(null);
  ctx.hideOverlay();
}

async function saveNameDialog(
  dialog: Exclude<NameDialogState, null>,
  name: string,
  onBookmarksUpdated: () => Promise<void>
): Promise<void> {
  if (dialog.kind === "rename") {
    await ipcRenderer.invoke(BrowserSettingsEvent.BROWSER_UPDATE, {
      ...dialog.item,
      name,
    } satisfies BrowserItem);
  } else {
    await ipcRenderer.invoke(BrowserSettingsEvent.BROWSER_ADD, {
      id: generateId(),
      name,
      type: "folder",
      parentId: dialog.parentId,
    } satisfies BrowserItem);
  }
  await onBookmarksUpdated();
}

function handleOverlayAction(payload: OverlayActionPayload, ctx: OverlayActionContext): void {
  switch (payload.action) {
    case "save-bookmark": {
      const name = (payload.name as string) || "";
      if (name) {
        ctx.setBookmarkDraftName(name);
        void ctx.handleBookmarkSave(name);
        ctx.hideOverlay();
      }
      break;
    }
    case "remove-bookmark": {
      void ctx.handleBookmarkRemove();
      ctx.hideOverlay();
      break;
    }
    case "select-folder-item": {
      const url = payload.url as string;
      const mode = payload.mode === "new" ? "new" : "current";
      if (url) ctx.submitAddress(mode, url);
      ctx.setFolderDropdown(null);
      ctx.hideOverlay();
      break;
    }
    case "open-item": {
      const itemId = payload.itemId as string;
      const mode = payload.mode === "new" ? "new" : "current";
      const item = ctx.bookmarks.find((b) => b.id === itemId);
      ctx.setBookmarkBarMenu(null);
      ctx.hideOverlay();
      if (item?.url) ctx.submitAddress(mode, item.url);
      break;
    }
    case "rename-item": {
      const itemId = payload.itemId as string;
      const itemName = payload.itemName as string;
      const item = ctx.bookmarks.find((b) => b.id === itemId);
      if (item) {
        ctx.setBookmarkBarMenu(null);
        ctx.setConfirmDialog(null);
        ctx.setNameDialog({ kind: "rename", item, draft: itemName });
        ctx.hideOverlay();
      }
      break;
    }
    case "new-folder": {
      const parentId = (payload.parentId ?? null) as string | null;
      ctx.setBookmarkBarMenu(null);
      ctx.setFolderDropdown(null);
      ctx.setConfirmDialog(null);
      ctx.setNameDialog({ kind: "newFolder", parentId, draft: "新文件夹" });
      ctx.hideOverlay();
      break;
    }
    case "move-item": {
      const parentId = (payload.parentId ?? null) as string | null;
      if (ctx.bookmarkBarMenu?.kind === "item") {
        const item = ctx.bookmarkBarMenu.item;
        ctx.setBookmarkBarMenu(null);
        ctx.hideOverlay();
        void ctx.moveItemToParent(item, parentId).then(() => {
          ctx.hideOverlay();
        });
      }
      break;
    }
    case "delete-item": {
      if (ctx.bookmarkBarMenu?.kind === "item") {
        const item = ctx.bookmarkBarMenu.item;
        ctx.setBookmarkBarMenu(null);
        ctx.hideOverlay();
        if (item.type === "folder" && countFolderDescendants(ctx.bookmarks, item.id) > 0) {
          ctx.setConfirmDialog({ kind: "delete", item });
        } else {
          void ctx.deleteBrowserItem(item).then(() => {
            ctx.hideOverlay();
          });
        }
      }
      break;
    }
    case "confirm-delete": {
      const itemId = payload.itemId as string;
      const item = ctx.bookmarks.find((b) => b.id === itemId);
      ctx.setConfirmDialog(null);
      ctx.hideOverlay();
      if (item) {
        void ctx.deleteBrowserItem(item).then(() => {
          ctx.hideOverlay();
        });
      }
      break;
    }
    case "cancel-confirm": {
      ctx.setConfirmDialog(null);
      ctx.hideOverlay();
      break;
    }
    case "commit-name": {
      const name = (payload.name as string) || "";
      if (!name) return;
      ctx.setNameDialog((prev) => {
        if (!prev) return prev;
        void saveNameDialog(prev, name, ctx.onBookmarksUpdated);
        return null;
      });
      ctx.hideOverlay();
      break;
    }
    case "close-name-dialog": {
      ctx.setNameDialog(null);
      ctx.hideOverlay();
      break;
    }
    case "dismiss-overlay": {
      closeAllBookmarkOverlays(ctx);
      break;
    }
    case "show-item-context-menu": {
      const itemId = payload.itemId as string;
      const found = ctx.bookmarks.find((b) => b.id === itemId);
      if (found) {
        const cx = (payload.x as number) + (payload.overlayX as number);
        const cy = (payload.y as number) + (payload.overlayY as number);
        ctx.setFolderDropdown(null);
        ctx.setBookmarkBarMenu({ kind: "item", x: cx, y: cy, item: found });
      }
      break;
    }
  }
}

interface BookmarkChromeContextValue {
  bookmarks: BrowserItem[];
  onBookmarksUpdated: () => Promise<void>;
  submitAddress: (mode: "current" | "new", url?: string) => void;
  bookmarkTargetUrl: string;
  activeTabTitle: string;
  activeTabId: string | null | undefined;
  existingBookmark: BrowserItem | undefined;
  canBookmark: boolean;
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
  confirmDialog: ConfirmDialogState;
  setConfirmDialog: React.Dispatch<React.SetStateAction<ConfirmDialogState>>;
  initStarDraft: () => void;
  handleBookmarkSave: () => Promise<void>;
  handleBookmarkRemove: () => Promise<void>;
  moveItemToParent: (item: BrowserItem, parentId: string | null) => Promise<void>;
  deleteBrowserItem: (item: BrowserItem) => Promise<void>;
  commitNameDialog: () => Promise<void>;
  showOverlay: (type: OverlayType, bounds: OverlayBounds, data: unknown) => void;
  hideOverlay: () => void;
}

const BookmarkChromeCtx = createContext<BookmarkChromeContextValue | null>(null);

function useBookmarkChrome(): BookmarkChromeContextValue {
  const v = useContext(BookmarkChromeCtx);
  if (!v) throw new Error("BookmarkChromeProvider missing");
  return v;
}

export interface BookmarkChromeProviderProps {
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
  const [folderDropdown, setFolderDropdown] = useState<{
    folderId: string;
    x: number;
    y: number;
  } | null>(null);
  const [bookmarkBarMenu, setBookmarkBarMenu] = useState<BookmarkBarMenuState>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);

  const showOverlay = useCallback(
    (type: OverlayType, bounds: OverlayBounds, data: unknown): void => {
      ipcRenderer.send(BrowserOverlayEvent.BROWSER_OVERLAY_SHOW, {
        bounds,
        data: { type, data },
      });
    },
    []
  );

  const hideOverlay = useCallback((): void => {
    ipcRenderer.send(BrowserOverlayEvent.BROWSER_OVERLAY_HIDE);
  }, []);

  // 以下 callbacks 必须在 useEffect 依赖数组之前声明，避免 TDZ 错误
  const handleBookmarkSave = useCallback(
    async (overlayName?: string): Promise<void> => {
      const name = (overlayName ?? bookmarkDraftName).trim();
      if (!name || !bookmarkTargetUrl) return;
      if (existingBookmark) {
        await ipcRenderer.invoke(BrowserSettingsEvent.BROWSER_UPDATE, {
          ...existingBookmark,
          name,
        } satisfies BrowserItem);
      } else {
        await ipcRenderer.invoke(BrowserSettingsEvent.BROWSER_ADD, {
          id: generateId(),
          name,
          url: bookmarkTargetUrl,
          type: "bookmark",
          parentId: null,
        } satisfies BrowserItem);
      }
      await onBookmarksUpdated();
      setBookmarkPopoverOpen(false);
    },
    [bookmarkDraftName, bookmarkTargetUrl, existingBookmark, onBookmarksUpdated]
  );

  const handleBookmarkRemove = useCallback(async (): Promise<void> => {
    if (!existingBookmark) return;
    await ipcRenderer.invoke(BrowserSettingsEvent.BROWSER_REMOVE, existingBookmark.id);
    await onBookmarksUpdated();
    setBookmarkPopoverOpen(false);
    hideOverlay();
  }, [existingBookmark, onBookmarksUpdated, hideOverlay]);

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
      await ipcRenderer.invoke(BrowserSettingsEvent.BROWSER_UPDATE, {
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
      await ipcRenderer.invoke(BrowserSettingsEvent.BROWSER_REMOVE, item.id);
      await onBookmarksUpdated();
      setBookmarkBarMenu(null);
      setFolderDropdown(null);
    },
    [onBookmarksUpdated]
  );

  // 用 ref 持有最新的 handler 所需数据，避免 useEffect 因依赖变化反复重注册监听器
  const overlayActionCtxRef = useRef({
    handleBookmarkSave,
    handleBookmarkRemove,
    moveItemToParent,
    deleteBrowserItem,
    submitAddress,
    showOverlay,
    hideOverlay,
    bookmarks,
    bookmarkBarMenu,
    onBookmarksUpdated,
    setBookmarkDraftName,
    setBookmarkPopoverOpen,
    setBookmarkBarMenu,
    setFolderDropdown,
    setNameDialog,
    setConfirmDialog,
  });
  overlayActionCtxRef.current = {
    handleBookmarkSave,
    handleBookmarkRemove,
    moveItemToParent,
    deleteBrowserItem,
    submitAddress,
    showOverlay,
    hideOverlay,
    bookmarks,
    bookmarkBarMenu,
    onBookmarksUpdated,
    setBookmarkDraftName,
    setBookmarkPopoverOpen,
    setBookmarkBarMenu,
    setFolderDropdown,
    setNameDialog,
    setConfirmDialog,
  };

  // 监听来自浮动窗口的用户操作（空依赖数组，只注册一次，通过 ref 读取最新上下文）
  useEffect(() => {
    const handler = (_e: unknown, payload: OverlayActionPayload): void => {
      handleOverlayAction(payload, overlayActionCtxRef.current);
    };
    ipcRenderer.on(BrowserOverlayEvent.BROWSER_OVERLAY_ACTION, handler);
    return () => {
      ipcRenderer.removeListener(BrowserOverlayEvent.BROWSER_OVERLAY_ACTION, handler);
    };
  }, []);

  useEffect(() => {
    closeAllBookmarkOverlays(overlayActionCtxRef.current);
  }, [activeTabId]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent): void => {
      const t = e.target instanceof Node ? e.target : null;
      if (!t) return;

      if (t instanceof Element && t.closest("input[type='text']")) return;
      if (t instanceof Element && t.closest("[data-bookmark-chip]")) return;
      if (t instanceof Element && t.closest("[data-bookmark-star-wrap]")) return;

      const hasOverlay =
        bookmarkPopoverOpen ||
        bookmarkBarMenu !== null ||
        folderDropdown !== null ||
        nameDialog !== null ||
        confirmDialog !== null;
      if (!hasOverlay) return;

      closeAllBookmarkOverlays(overlayActionCtxRef.current);
    };
    document.addEventListener("mousedown", onDocMouseDown, true);
    return () => document.removeEventListener("mousedown", onDocMouseDown, true);
  }, [
    bookmarkPopoverOpen,
    bookmarkBarMenu,
    folderDropdown,
    nameDialog,
    confirmDialog,
    hideOverlay,
  ]);

  const initStarDraft = useCallback((): void => {
    setBookmarkDraftName(
      getDefaultBookmarkName(existingBookmark, activeTabTitle, bookmarkTargetUrl)
    );
  }, [existingBookmark, activeTabTitle, bookmarkTargetUrl]);

  const commitNameDialog = useCallback(async (): Promise<void> => {
    if (!nameDialog) return;
    const name = nameDialog.draft.trim();
    if (!name) return;
    await saveNameDialog(nameDialog, name, onBookmarksUpdated);
    setNameDialog(null);
  }, [nameDialog, onBookmarksUpdated]);

  const value = useMemo(
    (): BookmarkChromeContextValue => ({
      bookmarks,
      onBookmarksUpdated,
      submitAddress,
      bookmarkTargetUrl,
      activeTabTitle,
      activeTabId,
      existingBookmark,
      canBookmark,
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
      confirmDialog,
      setConfirmDialog,
      initStarDraft,
      handleBookmarkSave,
      handleBookmarkRemove,
      moveItemToParent,
      deleteBrowserItem,
      commitNameDialog,
      showOverlay,
      hideOverlay,
    }),
    [
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
      confirmDialog,
      initStarDraft,
      handleBookmarkSave,
      handleBookmarkRemove,
      moveItemToParent,
      deleteBrowserItem,
      commitNameDialog,
      showOverlay,
      hideOverlay,
    ]
  );

  return (
    <BookmarkChromeCtx.Provider value={value}>
      <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }} componentSize="small">
        {children}
        <style>
          {
            ".tabbed-browser-chrome-root .vsgo-bookmark-bar-scroll{scrollbar-width:none;-ms-overflow-style:none}.tabbed-browser-chrome-root .vsgo-bookmark-bar-scroll::-webkit-scrollbar{display:none;height:0;width:0}"
          }
        </style>
      </ConfigProvider>
    </BookmarkChromeCtx.Provider>
  );
}

export function BookmarkChromeStar(): React.JSX.Element {
  const ctx = useBookmarkChrome();
  const starRef = useRef<HTMLDivElement>(null);

  const openStarOverlay = useCallback((): void => {
    if (!ctx.canBookmark) return;
    ctx.initStarDraft();
    ctx.setBookmarkPopoverOpen(true);

    const el = starRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();

    ctx.showOverlay(
      "bookmark-star",
      {
        x: Math.max(8, rect.right - 272),
        y: rect.bottom + 4,
        width: 272,
        height: 190,
      },
      {
        existingBookmark: ctx.existingBookmark,
        bookmarkTargetUrl: ctx.bookmarkTargetUrl,
        draftName: getDefaultBookmarkName(
          ctx.existingBookmark,
          ctx.activeTabTitle,
          ctx.bookmarkTargetUrl
        ),
      }
    );
  }, [ctx]);

  return (
    <div
      ref={starRef}
      data-bookmark-star-wrap
      style={
        { position: "relative", flexShrink: 0, WebkitAppRegion: "no-drag" } as React.CSSProperties
      }
    >
      <Button
        type="text"
        size="small"
        disabled={!ctx.canBookmark}
        icon={ctx.existingBookmark ? <StarFilled style={{ color: "#1677ff" }} /> : <StarOutlined />}
        onMouseDown={(e) => {
          e.preventDefault();
          if (ctx.bookmarkPopoverOpen) {
            ctx.setBookmarkPopoverOpen(false);
            ctx.hideOverlay();
          } else {
            openStarOverlay();
          }
        }}
        title={ctx.existingBookmark ? "已加入书签 — 点击编辑" : "为此页添加书签"}
        tabIndex={-1}
        style={{ width: 36, height: 28 }}
      />
    </div>
  );
}

export function BookmarkChromeBarRow(): React.JSX.Element {
  const ctx = useBookmarkChrome();
  const rootBarItems = useMemo(() => orderedRootBarItems(ctx.bookmarks), [ctx.bookmarks]);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, item: BrowserItem) => {
    e.dataTransfer.setData("text/plain", item.id);
    e.dataTransfer.effectAllowed = "move";
    (e.currentTarget as HTMLElement).style.opacity = "0.5";
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = "1";
    setDragOverId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(targetId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      setDragOverId(null);
      const sourceId = e.dataTransfer.getData("text/plain");
      if (!sourceId || sourceId === targetId) return;

      const source = ctx.bookmarks.find((b) => b.id === sourceId);
      if (!source) return;
      if ((source.parentId ?? null) !== null) return;

      const siblings = rootBarItems.filter((b) => b.id !== sourceId);
      const targetIndex = siblings.findIndex((b) => b.id === targetId);
      if (targetIndex === -1) return;

      siblings.splice(targetIndex, 0, source);
      for (let i = 0; i < siblings.length; i++) {
        const s = siblings[i];
        if ((s.order ?? i) !== i) {
          await ipcRenderer.invoke(BrowserSettingsEvent.BROWSER_REORDER, {
            id: s.id,
            order: i,
          });
        }
      }
      await ctx.onBookmarksUpdated();
    },
    [ctx.bookmarks, ctx.onBookmarksUpdated, rootBarItems]
  );

  // 文件夹下拉显示时，用浮动窗口
  useEffect(() => {
    if (ctx.folderDropdown) {
      const items = flattenFolderChildrenPreorder(
        ctx.bookmarks,
        ctx.folderDropdown.folderId,
        0
      ).map(({ item, depth }) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        depth,
        url: item.url,
      }));
      const bounds = clampOverlayBounds(
        ctx.folderDropdown.x,
        ctx.folderDropdown.y + 2,
        FOLDER_DROPDOWN_WIDTH,
        Math.min(FOLDER_DROPDOWN_MAX_HEIGHT, Math.max(40, 4 + items.length * 30))
      );
      ctx.showOverlay("folder-dropdown", bounds, { items, overlayX: bounds.x, overlayY: bounds.y });
    }
  }, [ctx.folderDropdown, ctx.bookmarks, ctx.showOverlay]);

  // 右键菜单显示时，用浮动窗口
  useEffect(() => {
    if (ctx.bookmarkBarMenu) {
      const items = ctx.bookmarkBarMenu;
      if (items.kind === "blank") {
        ctx.showOverlay("context-menu", clampOverlayBounds(items.x, items.y, MENU_WIDTH, 64), {
          kind: "blank",
          targets: [],
        });
      } else {
        const targets = moveParentTargets(ctx.bookmarks, items.item).map((t) => ({
          id: t.id,
          name: t.name,
        }));
        const baseItems = items.item.type === "bookmark" ? 8 : 6;
        const itemCount = baseItems + targets.length;
        ctx.showOverlay(
          "context-menu",
          clampOverlayBounds(
            items.x,
            items.y,
            MENU_WIDTH,
            Math.min(CONTEXT_MENU_MAX_HEIGHT, 4 + itemCount * 30)
          ),
          {
            kind: "item",
            item: items.item,
            targets,
          }
        );
      }
    }
  }, [ctx.bookmarkBarMenu, ctx.bookmarks, ctx.showOverlay]);

  // 名称对话框显示时，用浮动窗口
  useEffect(() => {
    if (ctx.nameDialog) {
      ctx.showOverlay(
        "name-dialog",
        clampOverlayBounds((window.innerWidth - 320) / 2, 120, 320, 140),
        {
          kind: ctx.nameDialog.kind,
          draft: ctx.nameDialog.draft,
          itemName: ctx.nameDialog.kind === "rename" ? ctx.nameDialog.item.name : undefined,
        }
      );
    }
  }, [ctx.nameDialog, ctx.showOverlay]);

  // 删除非空文件夹时二次确认
  useEffect(() => {
    if (!ctx.confirmDialog) return;
    const item = ctx.confirmDialog.item;
    const descendantCount = countFolderDescendants(ctx.bookmarks, item.id);
    ctx.showOverlay(
      "confirm-dialog",
      clampOverlayBounds((window.innerWidth - 320) / 2, 120, 320, 150),
      {
        kind: "delete",
        itemId: item.id,
        title: "删除文件夹",
        message: `将删除“${item.name}”及其中 ${descendantCount} 个项目。此操作不能撤销。`,
        confirmText: "删除",
      }
    );
  }, [ctx.confirmDialog, ctx.bookmarks, ctx.showOverlay]);

  const openNewFolderDialog = useCallback(
    (parentId: string | null): void => {
      ctx.setFolderDropdown(null);
      ctx.setBookmarkBarMenu(null);
      ctx.setNameDialog({ kind: "newFolder", parentId, draft: "新文件夹" });
    },
    [ctx]
  );

  return (
    <>
      <div
        className="vsgo-bookmark-bar-scroll tabbed-browser-bookmark-bar"
        onScroll={() => {
          ctx.setFolderDropdown(null);
          ctx.hideOverlay();
        }}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest("[data-bookmark-chip]")) return;
          e.preventDefault();
          ctx.setFolderDropdown(null);
          ctx.setBookmarkBarMenu({ kind: "blank", x: e.clientX, y: e.clientY });
        }}
        style={
          {
            height: 34,
            minHeight: 34,
            background: "#fff",
            borderBottom: "1px solid var(--ant-color-border-secondary)",
            display: "flex",
            alignItems: "center",
            padding: "0 8px 6px",
            boxSizing: "border-box",
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
          <>
            <Button
              data-bookmark-chip
              type="text"
              size="small"
              icon={<FolderAddOutlined />}
              onMouseDown={(e) => {
                if (e.button === 0) e.preventDefault();
              }}
              onClick={() => openNewFolderDialog(null)}
            >
              新建文件夹
            </Button>
            <Text type="secondary" style={{ fontSize: 12, paddingLeft: 2, userSelect: "none" }}>
              {ctx.bookmarks.length === 0 ? "点击星标添加书签" : "书签均在文件夹内"}
            </Text>
          </>
        ) : (
          rootBarItems.map((item) =>
            item.type === "folder" ? (
              <Button
                key={item.id}
                data-bookmark-chip
                size="small"
                type={ctx.folderDropdown?.folderId === item.id ? "link" : "text"}
                icon={<FolderOutlined />}
                draggable
                onDragStart={(e) => handleDragStart(e, item)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, item.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => void handleDrop(e, item.id)}
                style={{ ...(dragOverId === item.id ? { borderLeft: "2px solid #1a73e8" } : {}) }}
                onMouseDown={(e) => {
                  if (e.button === 0) e.preventDefault();
                }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  ctx.setFolderDropdown((prev) =>
                    prev?.folderId === item.id
                      ? null
                      : { folderId: item.id, x: rect.left, y: rect.bottom }
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
                style={{
                  maxWidth: 160,
                  ...(dragOverId === item.id ? { borderLeft: "2px solid #1a73e8" } : {}),
                }}
                title={`${item.name}\n${item.url ?? ""}`}
                draggable
                onDragStart={(e) => handleDragStart(e, item)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, item.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => void handleDrop(e, item.id)}
                onMouseDown={(e) => {
                  if (e.button === 0) e.preventDefault();
                }}
                onClick={(e) => {
                  if (item.url)
                    ctx.submitAddress(e.metaKey || e.ctrlKey ? "new" : "current", item.url);
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
    </>
  );
}
