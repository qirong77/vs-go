import { basename } from "node:path";
import { vsGoConfig } from "../../config";
import { getSubDirectory } from "../../utils/getSubDirectory";
import { finderBase64 } from "../../../common/finderBase64";
import { vscodeBase64 } from "../../../common/vscodeBase64";
import { IMainWindowFiles } from "../../../common/type";

// import { getVsCodeOpenedFolder } from "../../utils/getVsCodeOpenedFolder";
// import { readFileSync } from "node:fs";
// import { dialog } from "electron";
// import { debounce } from "../../../common/debounce";
/* TEST-WORKER
const worker = new Worker(new URL("../test-worker.js", import.meta.url));
// 监听来自 Worker 线程的消息
worker.on("message", (result) => {
  dialog.showMessageBox(result)
  console.log("Long task result:", result);
});
worker.postMessage("hello");
*/
export async function getMainWindowFiles() {
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
  const useVscodeFiles = vsGoConfig.workSpaceFiles.map((file) => {
    return {
      fileName: basename(file),
      filePath: file,
      iconBase64: finderBase64,
      useAppBase64: vscodeBase64,
    };
  }) as IMainWindowFiles;
  notUseVscodeDirs.push(...useVscodeFiles);
  const result = [...useVscodeDirs, ...notUseVscodeDirs,...useVscodeFiles];
  return result
}

