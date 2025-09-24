import { dialog } from "electron";
import { vsGoConfig } from "../config";
import { exec } from "child_process";
import { existsSync } from "fs";
export function openFileByVscode(filePath: string) {
  if (!existsSync(vsGoConfig.codeAppPath)) {
    dialog.showErrorBox("error", "未检测到Visual Studio Code,请先安装");
    return;
  }
  exec(
    `open -a "${vsGoConfig.codeAppPath}" "${filePath}"`,
    (error) => {
      if (error) {
        dialog.showErrorBox("error", JSON.stringify(error));
      }
    }
    // exec(`${vsGoConfig.codeCommandPath}  --new-window "${filePath}"`, (error) => {
    //   if (error) {
    //     dialog.showErrorBox("error", JSON.stringify(error));
    //   }
    // });
  );
}
