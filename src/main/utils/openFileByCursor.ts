import { dialog } from "electron";
import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { vsGoConfig } from "../config";

export function openFileByCursor(filePath: string): void {
  if (!existsSync(vsGoConfig.cursorAppPath)) {
    dialog.showErrorBox("未找到编辑器", "未检测到 Cursor，请先安装");
    return;
  }

  exec(`open -a "${vsGoConfig.cursorAppPath}" "${filePath}"`, (error) => {
    if (error) {
      dialog.showErrorBox("打开失败", error.message);
    }
  });
}
