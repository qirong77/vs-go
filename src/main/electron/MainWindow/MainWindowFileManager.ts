import { basename } from "node:path";
import { vsGoConfig } from "../../config";
import { getSubDirectory } from "../../utils/getSubDirectory";
import { finderBase64 } from "../../../common/finderBase64";
import { vscodeBase64 } from "../../../common/vscodeBase64";
import { IMainWindowFiles } from "../../../common/type";

import { getVsCodeOpenedFolder } from "../../utils/getVsCodeOpenedFolder";
import { readFileSync } from "node:fs";
/* TEST-WORKER
const worker = new Worker(new URL("../test-worker.js", import.meta.url));
// 监听来自 Worker 线程的消息
worker.on("message", (result) => {
  dialog.showMessageBox(result)
  console.log("Long task result:", result);
});
worker.postMessage("hello");
*/
export let mainWindowFiles: IMainWindowFiles = [];
export let vscodeOpenedFiles: IMainWindowFiles = [];
let lastGetVsCodeWindowFilesTime = 0;
let lastUpdateMainWindowFilesTime = 0;
export async function updateMainWindowFiles() {
  const canUpdate = new Date().getTime() -/* x分钟 */ 1 * (1000 * 60) > lastUpdateMainWindowFilesTime;
  if (!canUpdate) return;
  console.log("updateMainWindowFiles")
  lastUpdateMainWindowFilesTime = new Date().getTime();
  const directories = [] as string[];
  for (let i = 0; i < vsGoConfig.workSpaceDirectories.length; i++) {
    const dirs = await getSubDirectory(vsGoConfig.workSpaceDirectories[i]);
    directories.push(...dirs);
  }
  const useVscodeDirs = directories.map((dir) => {
    return {
      fileName: basename(dir),
      filePath: dir,
      iconBase64: finderBase64,
      useAppBase64: vscodeBase64,
    };
  }) as IMainWindowFiles;
  const notUseVscodeDirs = directories.map((dir) => {
    return {
      fileName: basename(dir),
      filePath: dir,
      iconBase64: finderBase64,
      useAppBase64: "",
    };
  }) as IMainWindowFiles;
  mainWindowFiles = [...useVscodeDirs, ...notUseVscodeDirs];
}
export function updateVsCodeOpenedFiles(isImmediate = false) {
  const canUpdate = new Date().getTime() - 3 * (1000 * 60) > lastGetVsCodeWindowFilesTime;
  if (!canUpdate && !isImmediate) return;
  console.log('updateVsCodeOpenedFiles')
  lastGetVsCodeWindowFilesTime = new Date().getTime();
  const vscodeOpenedFolders = getVsCodeOpenedFolder();
  const vscodeWindowStatus = JSON.parse(readFileSync(vsGoConfig.vscodeStausFilePath, "utf-8"));
  const filePaths = Object.keys(vscodeWindowStatus);
  const files = vscodeOpenedFolders
    .filter((dir) => {
      return filePaths.some((item) => item.endsWith(dir.folder));
    })
    .map((dir) => {
      return {
        fileName: dir.folder,
        filePath: filePaths.find((item) => item.endsWith(dir.folder)) || "",
        iconBase64: finderBase64,
        useAppBase64: vscodeBase64,
      };
    });
  vscodeOpenedFiles = files;
}
export function getMainWindowFiles() {
  return mainWindowFiles;
}
export function getVsCodeOpenedFiles() {
  return vscodeOpenedFiles;
}