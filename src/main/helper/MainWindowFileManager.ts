import { basename } from "node:path";
import { vsGoConfig } from "../config";
import { getSubDirectory } from "../utils/getSubDirectory";
import { finderBase64 } from "../../common/finderBase64";
import { vscodeBase64 } from "../../common/vscodeBase64";
import { IMainWindowFiles } from "../../common/type";
import { getVsCodeOpenedFolder } from "../utils/getVsCodeOpenedFolder";
import { readFileSync } from "node:fs";

export class MainWindowFileManager {
  mainWindowFiles: IMainWindowFiles = [];
  vscodeWindowFiles: IMainWindowFiles = [];
  constructor() {
    this.update();
  }
  async update() {
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
    this.mainWindowFiles = [...useVscodeDirs, ...notUseVscodeDirs];
  }
  updateVsCodeWindowFiles() {
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
      })
    this.vscodeWindowFiles = files;
  }
}
