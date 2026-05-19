import { ipcMain } from "electron";
import { WindowScriptEvent } from "@windows/script-editor/events";
import { formatError } from "@shared/utils";
import { windowScriptStore } from "./store";

export function registerWindowScriptHandlers(): void {
  ipcMain.handle(WindowScriptEvent.WINDOW_SCRIPT_GET, async () => {
    try {
      return windowScriptStore.get();
    } catch (error) {
      console.error("获取窗口脚本失败:", error);
      return "";
    }
  });

  ipcMain.handle(WindowScriptEvent.WINDOW_SCRIPT_SAVE, async (_event, content: string) => {
    try {
      windowScriptStore.save(content);
      return { success: true };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });
}
