import Store from "electron-store";
import { SavedCookie, SavedCookieByUrl } from "../../common/type";

// Define or import BrowserItem type
export type BrowserItem = {
  // Add appropriate fields here, for example:
  id: string;
  name: string;
  url: string;
  lastVisit?: number;
  type: "bookmark" | "history";
};

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
    additionalProperties: {
      type: "number",
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
  // Monaco编辑器笔记存储
  monacoNotes: {
    type: "object",
    default: {},
    additionalProperties: {
      type: "string",
    },
  },
  // Plate.js用户笔记内容
  userNoteContent: {
    type: "string",
    default: "",
  },
  // 用户笔记文件树
  userNotesTree: {
    type: "array",
    default: [],
  },
  // 用户笔记文件内容
  userNotesFiles: {
    type: "object",
    default: {},
    additionalProperties: {
      type: "string",
    },
  },
  // 当前打开的笔记文件ID
  userNotesCurrentFile: {
    type: "string",
    default: "",
  },
} as const;

// 在创建 store 之前先检查并修复配置文件
import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

function migrateConfigBeforeLoad() {
  try {
    const userDataPath = app.getPath('userData');
    const configPath = path.join(userDataPath, 'config.json');
    
    if (existsSync(configPath)) {
      const configData = JSON.parse(readFileSync(configPath, 'utf-8'));
      let needsSave = false;
      
      // 如果 userNotesTree 存在但不是数组，重置为空数组
      if (configData.userNotesTree !== undefined && !Array.isArray(configData.userNotesTree)) {
        configData.userNotesTree = [];
        needsSave = true;
      }
      
      if (needsSave) {
        writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf-8');
        console.log('Migrated config file successfully');
      }
    }
  } catch (error) {
    console.error('Failed to migrate config:', error);
  }
}

// 执行迁移
migrateConfigBeforeLoad();

// 创建 store 实例
const store = new Store({ schema });
export const vsgoStore = store;

// Cookie 存储相关方法
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
    const cookies = this.getSavedCookies();
    const filteredCookies = cookies.filter((cookie) => cookie.id !== id);
    vsgoStore.set("savedCookies", filteredCookies);
  },

  clearAllCookies(): void {
    vsgoStore.set("savedCookies", []);
  },
};

// 新的基于URL的Cookie存储方法
export const cookieByUrlStore = {
  getSavedCookiesByUrl(): SavedCookieByUrl[] {
    return vsgoStore.get("savedCookiesByUrl", []) as SavedCookieByUrl[];
  },

  saveCookieByUrl(cookieData: SavedCookieByUrl): void {
    const cookies = this.getSavedCookiesByUrl();
    // 如果同一个域名已存在，则更新；否则添加新记录
    const existingIndex = cookies.findIndex((cookie) => cookie.domain === cookieData.domain);
    if (existingIndex >= 0) {
      cookies[existingIndex] = cookieData;
    } else {
      cookies.push(cookieData);
    }
    vsgoStore.set("savedCookiesByUrl", cookies);
  },

  deleteCookieByUrl(id: string): void {
    const cookies = this.getSavedCookiesByUrl();
    const filteredCookies = cookies.filter((cookie) => cookie.id !== id);
    vsgoStore.set("savedCookiesByUrl", filteredCookies);
  },

  getCookieByUrl(url: string): SavedCookieByUrl | undefined {
    const cookies = this.getSavedCookiesByUrl();
    return cookies.find((cookie) => cookie.url === url);
  },

  clearAllCookiesByUrl(): void {
    vsgoStore.set("savedCookiesByUrl", []);
  },
};

// 文件访问历史存储方法
export const fileAccessStore = {
  getFileAccessHistory(): Record<string, number> {
    return vsgoStore.get("fileAccessHistory", {}) as Record<string, number>;
  },

  updateFileAccessTime(filePath: string): void {
    const history = this.getFileAccessHistory();
    history[filePath] = Date.now();
    vsgoStore.set("fileAccessHistory", history);
  },

  getFileAccessTime(filePath: string): number | undefined {
    const history = this.getFileAccessHistory();
    return history[filePath];
  },

  clearFileAccessHistory(): void {
    vsgoStore.set("fileAccessHistory", {});
  },
};

// Monaco编辑器笔记存储方法
export const monacoNotesStore = {
  getMonacoNotes(): Record<string, string> {
    return vsgoStore.get("monacoNotes", {}) as Record<string, string>;
  },

  getMonacoNote(key: string): string {
    const notes = this.getMonacoNotes();
    return notes[key] || "";
  },

  saveMonacoNote(key: string, content: string): void {
    const notes = this.getMonacoNotes();
    notes[key] = content;
    vsgoStore.set("monacoNotes", notes);
  },

  deleteMonacoNote(key: string): void {
    const notes = this.getMonacoNotes();
    delete notes[key];
    vsgoStore.set("monacoNotes", notes);
  },

  clearAllMonacoNotes(): void {
    vsgoStore.set("monacoNotes", {});
  },
};

// 用户笔记存储方法
export const userNotesStore = {
  getUserNoteContent(): string {
    return vsgoStore.get("userNoteContent", "") as string;
  },

  saveUserNoteContent(content: string): void {
    vsgoStore.set("userNoteContent", content);
  },

  clearUserNoteContent(): void {
    vsgoStore.set("userNoteContent", "");
  },
};

// 用户笔记文件树节点类型
export interface NoteTreeNode {
  key: string;
  title: string;
  isLeaf?: boolean;
  children?: NoteTreeNode[];
}

// 用户笔记文件树存储方法
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

  // 生成唯一ID
  generateId(): string {
    return `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  // 在树中查找节点
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

  // 在树中查找父节点
  findParent(tree: NoteTreeNode[], key: string): NoteTreeNode | null {
    for (const node of tree) {
      if (node.children) {
        if (node.children.some(child => child.key === key)) {
          return node;
        }
        const found = this.findParent(node.children, key);
        if (found) return found;
      }
    }
    return null;
  },

  // 创建文件
  createFile(name: string, parentId?: string): NoteTreeNode {
    const tree = this.getTree();
    const newNode: NoteTreeNode = {
      key: this.generateId(),
      title: name.endsWith('.md') ? name : `${name}.md`,
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
    // 初始化文件内容
    this.saveFileContent(newNode.key, `# ${name.replace('.md', '')}\n\n`);
    return newNode;
  },

  // 创建文件夹
  createFolder(name: string, parentId?: string): NoteTreeNode {
    const tree = this.getTree();
    const newNode: NoteTreeNode = {
      key: this.generateId(),
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

  // 删除节点（递归删除子节点的文件内容）
  deleteNode(nodeId: string): boolean {
    const tree = this.getTree();
    
    const deleteRecursive = (nodes: NoteTreeNode[], key: string): boolean => {
      const index = nodes.findIndex(n => n.key === key);
      if (index !== -1) {
        const node = nodes[index];
        // 递归删除子节点的文件内容
        const deleteContents = (n: NoteTreeNode) => {
          if (n.isLeaf) {
            this.deleteFileContent(n.key);
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
      // 如果删除的是当前文件，清空当前文件
      if (this.getCurrentFile() === nodeId) {
        this.setCurrentFile("");
      }
    }
    return result;
  },

  // 重命名节点
  renameNode(nodeId: string, newName: string): boolean {
    const tree = this.getTree();
    const node = this.findNode(tree, nodeId);
    if (node) {
      node.title = node.isLeaf && !newName.endsWith('.md') ? `${newName}.md` : newName;
      this.saveTree(tree);
      return true;
    }
    return false;
  },
};
