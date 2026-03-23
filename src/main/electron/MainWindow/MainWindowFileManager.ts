import { basename, resolve } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";
import { getSubDirectory } from "../../utils/getSubDirectory";
import { finderBase64 } from "../../../common/finderBase64";
import { vscodeBase64 } from "../../../common/vscodeBase64";
import type { IMainWindowFiles } from "../../../common/type";
import type { BrowserItem } from "../../../common/type";
import { vsgoStore, fileAccessStore } from "../store";

export async function getMainWindowFiles(): Promise<IMainWindowFiles> {
  const browserList = vsgoStore.get("browserList") as BrowserItem[];
  const browserFiles = browserList.map((item) => ({
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
  const projectPath = resolve(homedir(), "Desktop", "VsGo-Projects");
  if (!existsSync(projectPath)) {
    mkdirSync(projectPath);
  }

  const desktopPath = resolve(homedir(), "Desktop");

  return [projectPath, desktopPath]
    .flatMap((dir) => {
      const subDirs = getSubDirectory(dir);
      return subDirs.flatMap((subDir) => [
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
  const results: IMainWindowFiles = [];
  const configs = [".zshrc", ".zprofile"];

  for (const configName of configs) {
    const configPath = resolve(homedir(), configName);
    if (existsSync(configPath)) {
      results.push({
        filePath: configPath,
        fileName: configName,
        iconBase64: finderBase64,
        useAppBase64: vscodeBase64,
      });
    }
  }

  return results;
}
