import { basename } from "node:path";
import { existsSync } from "node:fs";
import { getSubDirectory } from "@utils/getSubDirectory";
import { vsGoConfig } from "@config";
import { finderBase64 } from "@shared/finderBase64";
import { vscodeBase64 } from "@shared/vscodeBase64";
import type { IMainWindowFiles } from "@shared/type";
import type { BrowserItem } from "@shared/type";
import { browserStore } from "@windows/browser/store";
import { fileAccessStore } from "../store";

let filesCache: IMainWindowFiles | null = null;
let refreshPromise: Promise<IMainWindowFiles> | null = null;

/** 访问被系统拒绝的路径冷却，避免每次唤起搜索窗都再次触发权限弹窗 */
const ACCESS_DENIED_COOLDOWN_MS = 10 * 60 * 1000;
const accessDeniedUntil = new Map<string, number>();

export function getMainWindowFilesCache(): IMainWindowFiles | null {
  return filesCache;
}

/** 后台刷新列表缓存，供搜索窗即时展示 */
export function refreshMainWindowFilesCache(): Promise<IMainWindowFiles> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = buildMainWindowFiles()
    .then((files) => {
      filesCache = files;
      return files;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export async function getMainWindowFiles(): Promise<IMainWindowFiles> {
  if (filesCache) return filesCache;
  return refreshMainWindowFilesCache();
}

async function buildMainWindowFiles(): Promise<IMainWindowFiles> {
  const browserList = browserStore.getList();
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

function isAccessDenied(dir: string): boolean {
  const until = accessDeniedUntil.get(dir);
  return until != null && Date.now() < until;
}

function markAccessDenied(dir: string): void {
  accessDeniedUntil.set(dir, Date.now() + ACCESS_DENIED_COOLDOWN_MS);
}

function clearAccessDenied(dir: string): void {
  accessDeniedUntil.delete(dir);
}

function isPermissionError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error.code === "EPERM" || error.code === "EACCES")
  );
}

function entriesForWorkspaceItem(subDir: string): IMainWindowFiles {
  const fileName = basename(subDir);

  // 桌面/目录下的 .app：只提供启动入口，不生成编辑器入口
  if (fileName.endsWith(".app")) {
    return [
      {
        fileName,
        filePath: subDir,
        iconBase64: finderBase64,
        useAppBase64: "",
      },
    ];
  }

  return [
    {
      fileName,
      filePath: subDir,
      iconBase64: finderBase64,
      useAppBase64: vscodeBase64,
    },
    {
      fileName,
      filePath: subDir,
      iconBase64: finderBase64,
      useAppBase64: "",
    },
  ];
}

function getWorkSpaceFiles(): IMainWindowFiles {
  return vsGoConfig.workSpaceDirectories.flatMap((dir) => {
    if (isAccessDenied(dir)) return [];

    try {
      if (!existsSync(dir)) return [];
      const subDirs = getSubDirectory(dir);
      clearAccessDenied(dir);
      return subDirs.flatMap(entriesForWorkspaceItem);
    } catch (error) {
      if (isPermissionError(error)) {
        markAccessDenied(dir);
        console.warn(`Workspace directory access denied (cooldown): ${dir}`);
      } else {
        console.error(`Failed to list workspace directory: ${dir}`, error);
      }
      return [];
    }
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
