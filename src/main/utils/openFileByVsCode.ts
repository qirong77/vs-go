import { dialog } from "electron";
import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { vsGoConfig } from "../config";

export function openFileByVscode(filePath: string): void {
  if (!existsSync(vsGoConfig.codeAppPath)) {
    dialog.showErrorBox("未找到编辑器", "未检测到 Visual Studio Code，请先安装");
    return;
  }

  exec(`open -a "${vsGoConfig.codeAppPath}" "${filePath}"`, (error) => {
    if (error) {
      dialog.showErrorBox("打开失败", error.message);
    }
  });
}
