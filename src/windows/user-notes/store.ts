import type { NoteTreeNode, UserNoteHistoryEntry, UserNoteHistoryMeta } from "@shared/type";
import { generateId } from "@shared/utils";
import { vsgoStore } from "@platform/store/instance";

const MAX_NOTE_HISTORY_VERSIONS = 10;

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

export const userNotesHistoryStore = {
  getAll(): Record<string, UserNoteHistoryEntry[]> {
    return vsgoStore.get("userNotesFileHistory", {}) as Record<string, UserNoteHistoryEntry[]>;
  },

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
