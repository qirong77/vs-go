import Store from "electron-store";
import { app } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  SavedCookie,
  SavedCookieByUrl,
  NoteTreeNode,
  UserNoteHistoryEntry,
  UserNoteHistoryMeta,
  BrowserHistoryEntry,
} from "../../common/type";
import { generateId } from "../../common/utils";

// ============================================================
// Schema 定义
// ============================================================

const schema = {
  browserList: {
    type: "array",
    default: [],
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        url: { type: "string" },
      },
    },
  },
  fileAccessHistory: {
    type: "object",
    default: {},
    additionalProperties: { type: "number" },
  },
  browserHistory: {
    type: "array",
    default: [],
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        url: { type: "string" },
        title: { type: "string" },
        visitTime: { type: "number" },
      },
    },
  },
  savedCookies: {
    type: "array",
    default: [],
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        domain: { type: "string" },
        name: { type: "string" },
        value: { type: "string" },
        path: { type: "string" },
        secure: { type: "boolean" },
        httpOnly: { type: "boolean" },
        expirationDate: { type: "number" },
        sameSite: { type: "string" },
        saveTime: { type: "number" },
        saveTimeDisplay: { type: "string" },
      },
    },
  },
  savedCookiesByUrl: {
    type: "array",
    default: [],
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        url: { type: "string" },
        domain: { type: "string" },
        cookieString: { type: "string" },
        saveTime: { type: "number" },
        saveTimeDisplay: { type: "string" },
      },
    },
  },
  savedNotes: {
    type: "array",
    default: [],
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        url: { type: "string" },
        domain: { type: "string" },
        title: { type: "string" },
        content: { type: "string" },
        createTime: { type: "number" },
        updateTime: { type: "number" },
        createTimeDisplay: { type: "string" },
        updateTimeDisplay: { type: "string" },
      },
    },
  },
  singleNote: {
    type: "object",
    default: {
      title: "",
      content: "",
      updateTime: 0,
      updateTimeDisplay: "",
    },
    properties: {
      title: { type: "string" },
      content: { type: "string" },
      updateTime: { type: "number" },
      updateTimeDisplay: { type: "string" },
    },
  },
  monacoNotes: {
    type: "object",
    default: {},
    additionalProperties: { type: "string" },
  },
  userNoteContent: {
    type: "string",
    default: "",
  },
  userNotesTree: {
    type: "array",
    default: [],
  },
  userNotesFiles: {
    type: "object",
    default: {},
    additionalProperties: { type: "string" },
  },
  userNotesCurrentFile: {
    type: "string",
    default: "",
  },
  userNotesFileHistory: {
    type: "object",
    default: {},
    additionalProperties: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          savedAt: { type: "number" },
          content: { type: "string" },
        },
      },
    },
  },
  appSettings: {
    type: "object",
    default: { defaultEditor: "vscode" },
    properties: {
      defaultEditor: { type: "string" },
    },
  },
  floatingWindowUserScript: {
    type: "string",
    default: "",
  },
} as const;

// ============================================================
// 数据迁移（在创建 store 之前执行）
// ============================================================

function migrateConfigBeforeLoad(): void {
  try {
    const userDataPath = app.getPath("userData");
    const configPath = path.join(userDataPath, "config.json");

    if (!existsSync(configPath)) return;

    const configData = JSON.parse(readFileSync(configPath, "utf-8"));
    let needsSave = false;

    if (configData.userNotesTree !== undefined && !Array.isArray(configData.userNotesTree)) {
      configData.userNotesTree = [];
      needsSave = true;
    }

    if (needsSave) {
      writeFileSync(configPath, JSON.stringify(configData, null, 2), "utf-8");
    }
  } catch (error) {
    console.error("Failed to migrate config:", error);
  }
}

migrateConfigBeforeLoad();

// ============================================================
// Store 实例
// ============================================================

const store = new Store({ schema });
export const vsgoStore = store;

// ============================================================
// 领域存储方法
// ============================================================

export const cookieStore = {
  getSavedCookies(): SavedCookie[] {
    return vsgoStore.get("savedCookies", []) as SavedCookie[];
  },
  saveCookie(cookie: SavedCookie): void {
    const cookies = this.getSavedCookies();
    cookies.push(cookie);
    vsgoStore.set("savedCookies", cookies);
  },
  deleteCookie(id: string): void {
    const filtered = this.getSavedCookies().filter((c) => c.id !== id);
    vsgoStore.set("savedCookies", filtered);
  },
  clearAll(): void {
    vsgoStore.set("savedCookies", []);
  },
};

export const cookieByUrlStore = {
  getAll(): SavedCookieByUrl[] {
    return vsgoStore.get("savedCookiesByUrl", []) as SavedCookieByUrl[];
  },
  save(cookieData: SavedCookieByUrl): void {
    const cookies = this.getAll();
    const existingIndex = cookies.findIndex((c) => c.domain === cookieData.domain);
    if (existingIndex >= 0) {
      cookies[existingIndex] = cookieData;
    } else {
      cookies.push(cookieData);
    }
    vsgoStore.set("savedCookiesByUrl", cookies);
  },
  delete(id: string): void {
    const filtered = this.getAll().filter((c) => c.id !== id);
    vsgoStore.set("savedCookiesByUrl", filtered);
  },
  getByUrl(url: string): SavedCookieByUrl | undefined {
    return this.getAll().find((c) => c.url === url);
  },
  clearAll(): void {
    vsgoStore.set("savedCookiesByUrl", []);
  },
};

export const fileAccessStore = {
  getHistory(): Record<string, number> {
    return vsgoStore.get("fileAccessHistory", {}) as Record<string, number>;
  },
  updateAccessTime(filePath: string): void {
    const history = this.getHistory();
    history[filePath] = Date.now();
    vsgoStore.set("fileAccessHistory", history);
  },
  getAccessTime(filePath: string): number | undefined {
    return this.getHistory()[filePath];
  },
  clearAll(): void {
    vsgoStore.set("fileAccessHistory", {});
  },
};

export const monacoNotesStore = {
  getAll(): Record<string, string> {
    return vsgoStore.get("monacoNotes", {}) as Record<string, string>;
  },
  get(key: string): string {
    return this.getAll()[key] || "";
  },
  save(key: string, content: string): void {
    const notes = this.getAll();
    notes[key] = content;
    vsgoStore.set("monacoNotes", notes);
  },
  delete(key: string): void {
    const notes = this.getAll();
    delete notes[key];
    vsgoStore.set("monacoNotes", notes);
  },
  clearAll(): void {
    vsgoStore.set("monacoNotes", {});
  },
};

export const userNotesStore = {
  getContent(): string {
    return vsgoStore.get("userNoteContent", "") as string;
  },
  saveContent(content: string): void {
    vsgoStore.set("userNoteContent", content);
  },
  clearContent(): void {
    vsgoStore.set("userNoteContent", "");
  },
};

const MAX_NOTE_HISTORY_VERSIONS = 10;

export const userNotesHistoryStore = {
  getAll(): Record<string, UserNoteHistoryEntry[]> {
    return vsgoStore.get("userNotesFileHistory", {}) as Record<string, UserNoteHistoryEntry[]>;
  },

  /** 列表元数据，从新到旧 */
  listMetaForFile(fileId: string): UserNoteHistoryMeta[] {
    const list = this.getAll()[fileId] || [];
    return [...list]
      .reverse()
      .map(({ id, savedAt }) => ({ id, savedAt }));
  },

  getEntry(fileId: string, versionId: string): UserNoteHistoryEntry | undefined {
    const list = this.getAll()[fileId] || [];
    return list.find((e) => e.id === versionId);
  },

  /**
   * 在队列尾部追加一条快照（最旧在前、最新在后）；超过条数则丢弃最旧。
   * 若与上一条内容完全相同则跳过。
   */
  appendSnapshot(fileId: string, content: string): void {
    const all = this.getAll();
    const prev = [...(all[fileId] || [])];
    const last = prev[prev.length - 1];
    if (last && last.content === content) {
      return;
    }
    const entry: UserNoteHistoryEntry = {
      id: generateId("hist"),
      savedAt: Date.now(),
      content,
    };
    prev.push(entry);
    while (prev.length > MAX_NOTE_HISTORY_VERSIONS) {
      prev.shift();
    }
    all[fileId] = prev;
    vsgoStore.set("userNotesFileHistory", all);
  },

  deleteForFile(fileId: string): void {
    const all = this.getAll();
    if (!all[fileId]) return;
    delete all[fileId];
    vsgoStore.set("userNotesFileHistory", all);
  },
};

const MAX_BROWSER_HISTORY = 200;

export const browserHistoryStore = {
  getAll(): BrowserHistoryEntry[] {
    return vsgoStore.get("browserHistory", []) as BrowserHistoryEntry[];
  },
  add(url: string, title: string): void {
    if (!url || /^(about:|chrome:|devtools:|file:)/.test(url)) return;
    const list = this.getAll().filter((e) => e.url !== url);
    list.unshift({ id: generateId("bh"), url, title: title || url, visitTime: Date.now() });
    vsgoStore.set("browserHistory", list.slice(0, MAX_BROWSER_HISTORY));
  },
  clearAll(): void {
    vsgoStore.set("browserHistory", []);
  },
};

export const windowScriptStore = {
  get(): string {
    return vsgoStore.get("floatingWindowUserScript", "") as string;
  },
  save(content: string): void {
    vsgoStore.set("floatingWindowUserScript", content);
  },
};

export const userNotesTreeStore = {
  getTree(): NoteTreeNode[] {
    return vsgoStore.get("userNotesTree", []) as NoteTreeNode[];
  },

  saveTree(tree: NoteTreeNode[]): void {
    vsgoStore.set("userNotesTree", tree);
  },

  getFileContent(fileId: string): string {
    const files = vsgoStore.get("userNotesFiles", {}) as Record<string, string>;
    return files[fileId] || "";
  },

  saveFileContent(fileId: string, content: string): void {
    const files = vsgoStore.get("userNotesFiles", {}) as Record<string, string>;
    files[fileId] = content;
    vsgoStore.set("userNotesFiles", files);
  },

  deleteFileContent(fileId: string): void {
    const files = vsgoStore.get("userNotesFiles", {}) as Record<string, string>;
    delete files[fileId];
    vsgoStore.set("userNotesFiles", files);
  },

  getCurrentFile(): string {
    return vsgoStore.get("userNotesCurrentFile", "") as string;
  },

  setCurrentFile(fileId: string): void {
    vsgoStore.set("userNotesCurrentFile", fileId);
  },

  findNode(tree: NoteTreeNode[], key: string): NoteTreeNode | null {
    for (const node of tree) {
      if (node.key === key) return node;
      if (node.children) {
        const found = this.findNode(node.children, key);
        if (found) return found;
      }
    }
    return null;
  },

  findParent(tree: NoteTreeNode[], key: string): NoteTreeNode | null {
    for (const node of tree) {
      if (node.children) {
        if (node.children.some((child) => child.key === key)) return node;
        const found = this.findParent(node.children, key);
        if (found) return found;
      }
    }
    return null;
  },

  createFile(name: string, parentId?: string): NoteTreeNode {
    const tree = this.getTree();
    const newNode: NoteTreeNode = {
      key: generateId("note"),
      title: name.endsWith(".md") ? name : `${name}.md`,
      isLeaf: true,
    };

    if (parentId) {
      const parent = this.findNode(tree, parentId);
      if (parent && !parent.isLeaf) {
        if (!parent.children) parent.children = [];
        parent.children.push(newNode);
      }
    } else {
      tree.push(newNode);
    }

    this.saveTree(tree);
    this.saveFileContent(newNode.key, `# ${name.replace(".md", "")}\n\n`);
    return newNode;
  },

  createFolder(name: string, parentId?: string): NoteTreeNode {
    const tree = this.getTree();
    const newNode: NoteTreeNode = {
      key: generateId("note"),
      title: name,
      isLeaf: false,
      children: [],
    };

    if (parentId) {
      const parent = this.findNode(tree, parentId);
      if (parent && !parent.isLeaf) {
        if (!parent.children) parent.children = [];
        parent.children.push(newNode);
      }
    } else {
      tree.push(newNode);
    }

    this.saveTree(tree);
    return newNode;
  },

  deleteNode(nodeId: string): boolean {
    const tree = this.getTree();

    const deleteRecursive = (nodes: NoteTreeNode[], key: string): boolean => {
      const index = nodes.findIndex((n) => n.key === key);
      if (index !== -1) {
        const node = nodes[index];
        const deleteContents = (n: NoteTreeNode): void => {
          if (n.isLeaf) {
            this.deleteFileContent(n.key);
            userNotesHistoryStore.deleteForFile(n.key);
          } else if (n.children) {
            n.children.forEach(deleteContents);
          }
        };
        deleteContents(node);
        nodes.splice(index, 1);
        return true;
      }

      for (const node of nodes) {
        if (node.children && deleteRecursive(node.children, key)) {
          return true;
        }
      }
      return false;
    };

    const result = deleteRecursive(tree, nodeId);
    if (result) {
      this.saveTree(tree);
      if (this.getCurrentFile() === nodeId) {
        this.setCurrentFile("");
      }
    }
    return result;
  },

  renameNode(nodeId: string, newName: string): boolean {
    const tree = this.getTree();
    const node = this.findNode(tree, nodeId);
    if (node) {
      node.title = node.isLeaf && !newName.endsWith(".md") ? `${newName}.md` : newName;
      this.saveTree(tree);
      return true;
    }
    return false;
  },
};
