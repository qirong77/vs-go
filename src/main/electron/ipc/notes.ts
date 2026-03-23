import { ipcMain } from "electron";
import { VS_GO_EVENT } from "../../../common/EVENT";
import { formatError } from "../../../common/utils";
import { monacoNotesStore, userNotesStore, userNotesTreeStore } from "../store";

export function registerNotesHandlers(): void {
  // --- Monaco 编辑器笔记 ---

  ipcMain.handle(VS_GO_EVENT.MONACO_EDITOR_GET_CONTENT, async (_event, url?: string) => {
    try {
      return monacoNotesStore.get(url || "global");
    } catch (error) {
      console.error("获取笔记内容失败:", error);
      return "";
    }
  });

  ipcMain.handle(
    VS_GO_EVENT.MONACO_EDITOR_CONTENT_CHANGED,
    async (_event, content: string, url?: string) => {
      try {
        monacoNotesStore.save(url || "global", content);
        return { success: true };
      } catch (error) {
        return { success: false, error: formatError(error) };
      }
    }
  );

  // --- 用户笔记（Milkdown）---

  ipcMain.handle(VS_GO_EVENT.USER_NOTES_GET_CONTENT, async () => {
    try {
      return userNotesStore.getContent();
    } catch (error) {
      console.error("获取用户笔记内容失败:", error);
      return "";
    }
  });

  ipcMain.handle(VS_GO_EVENT.USER_NOTES_SAVE_CONTENT, async (_event, content: string) => {
    try {
      userNotesStore.saveContent(content);
      return { success: true };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });

  // --- 用户笔记文件树 ---

  ipcMain.handle(VS_GO_EVENT.USER_NOTES_GET_TREE, async () => {
    try {
      return userNotesTreeStore.getTree();
    } catch (error) {
      console.error("获取笔记文件树失败:", error);
      return [];
    }
  });

  ipcMain.handle(VS_GO_EVENT.USER_NOTES_GET_FILE, async (_event, fileId: string) => {
    try {
      return userNotesTreeStore.getFileContent(fileId);
    } catch (error) {
      console.error("获取笔记文件内容失败:", error);
      return "";
    }
  });

  ipcMain.handle(
    VS_GO_EVENT.USER_NOTES_SAVE_FILE,
    async (_event, fileId: string, content: string) => {
      try {
        userNotesTreeStore.saveFileContent(fileId, content);
        return { success: true };
      } catch (error) {
        return { success: false, error: formatError(error) };
      }
    }
  );

  ipcMain.handle(
    VS_GO_EVENT.USER_NOTES_CREATE_FILE,
    async (_event, name: string, parentId?: string) => {
      try {
        const newNode = userNotesTreeStore.createFile(name, parentId);
        return { success: true, node: newNode };
      } catch (error) {
        return { success: false, error: formatError(error) };
      }
    }
  );

  ipcMain.handle(
    VS_GO_EVENT.USER_NOTES_CREATE_FOLDER,
    async (_event, name: string, parentId?: string) => {
      try {
        const newNode = userNotesTreeStore.createFolder(name, parentId);
        return { success: true, node: newNode };
      } catch (error) {
        return { success: false, error: formatError(error) };
      }
    }
  );

  ipcMain.handle(VS_GO_EVENT.USER_NOTES_DELETE_NODE, async (_event, nodeId: string) => {
    try {
      const result = userNotesTreeStore.deleteNode(nodeId);
      return { success: result };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });

  ipcMain.handle(
    VS_GO_EVENT.USER_NOTES_RENAME_NODE,
    async (_event, nodeId: string, newName: string) => {
      try {
        const result = userNotesTreeStore.renameNode(nodeId, newName);
        return { success: result };
      } catch (error) {
        return { success: false, error: formatError(error) };
      }
    }
  );

  ipcMain.handle(VS_GO_EVENT.USER_NOTES_GET_CURRENT_FILE, async () => {
    try {
      return userNotesTreeStore.getCurrentFile();
    } catch (error) {
      console.error("获取当前笔记文件失败:", error);
      return "";
    }
  });

  ipcMain.handle(VS_GO_EVENT.USER_NOTES_SET_CURRENT_FILE, async (_event, fileId: string) => {
    try {
      userNotesTreeStore.setCurrentFile(fileId);
      return { success: true };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });
}
