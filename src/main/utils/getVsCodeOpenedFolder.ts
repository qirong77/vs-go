import { vsGoConfig } from "../config/index";
import { getExecString } from "./getExecString";

export function getVsCodeOpenedFolder() {
    // 执行code相关的命令会有Vscode在docker栏跳动,目前看无法避免
    const codeStatus = getExecString(`${vsGoConfig.codeCommandPath} -s`)
    return getWindowFiles(codeStatus) || []
}
/* 
Workspace Stats: 
|  Window (kuaishou-frontend-idp)
|  Window (config.ts — qirong-extension)
|  Window (getVsCodeOpenedFolder.ts — vsgo)
|  Window (ceres-components-tiangong)
|    Folder (qirong-extension): 29 files
*/
function getWindowFiles(vscodeStatus = "") {
  const regex = /^\|  Window \(([^—\n]+)(?: — ([^\)]+))?\)/;

  const windows = vscodeStatus
    .split("\n")
    .filter((line) => regex.test(line))
    .map((line) => {
      const matches = line.match(regex);
      if (!matches) {
        return null;
      }
      const file = matches[1];
      const folder = matches[2] || ""; // Default to empty string if folder is not present
      if (!folder) {
        return {
          file: folder,
          folder: file,
        };
      }
      return {
        file,
        folder,
      };
    });

  return windows.filter(Boolean) as { file: string; folder: string }[];
}
