import { basename } from "node:path";
import { existsSync } from "node:fs";
import { getSubDirectory } from "@utils/getSubDirectory";
import { vsGoConfig } from "@config";
import { finderBase64 } from "@shared/finderBase64";
import { vscodeBase64 } from "@shared/vscodeBase64";
import type { IMainWindowFiles } from "@shared/type";
import type { BrowserItem } from "@shared/type";
import { vsgoStore } from "@platform/store/instance";
import { fileAccessStore } from "../store";

export async function getMainWindowFiles(): Promise<IMainWindowFiles> {
  const browserList = vsgoStore.get("browserList") as BrowserItem[];
  const browserFiles = browserList
    .filter(
      (item): item is BrowserItem & { url: string } =>
        item.type === "bookmark" && !!item.url
    )
    .map((item) => ({
      fileName: item.name,
      filePath: item.url,
      iconBase64: "",
      useAppBase64: "",
      browser: { ...item },
    }));

  const files = [...getWorkSpaceFiles(), ...getShellConfigFiles(), ...browserFiles];

  return files.map((file) => ({
    ...file,
    lastAccessTime: fileAccessStore.getAccessTime(file.filePath),
  }));
}

function getWorkSpaceFiles(): IMainWindowFiles {
  return vsGoConfig.workSpaceDirectories.flatMap((dir) => {
    if (!existsSync(dir)) return [];
    return getSubDirectory(dir).flatMap((subDir) => [
      {
        fileName: basename(subDir),
        filePath: subDir,
        iconBase64: finderBase64,
        useAppBase64: vscodeBase64,
      },
      {
        fileName: basename(subDir),
        filePath: subDir,
        iconBase64: finderBase64,
        useAppBase64: "",
      },
    ]);
  });
}

function getShellConfigFiles(): IMainWindowFiles {
  return vsGoConfig.shellConfigFiles.map((configPath) => ({
    filePath: configPath,
    fileName: basename(configPath),
    iconBase64: finderBase64,
    useAppBase64: vscodeBase64,
  }));
}
