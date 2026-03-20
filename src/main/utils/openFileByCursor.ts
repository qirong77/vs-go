import { dialog } from "electron";
import { vsGoConfig } from "../config";
import { exec } from "child_process";
import { existsSync } from "fs";

export function openFileByCursor(filePath: string) {
  if (!existsSync(vsGoConfig.cursorAppPath)) {
    dialog.showErrorBox("error", "未检测到 Cursor，请先安装");
    return;
  }
  exec(`open -a "${vsGoConfig.cursorAppPath}" "${filePath}"`, (error) => {
    if (error) {
      dialog.showErrorBox("error", JSON.stringify(error));
    }
  });
}
