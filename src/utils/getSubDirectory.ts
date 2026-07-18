import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

function isPermissionError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error.code === "EPERM" || error.code === "EACCES")
  );
}

export function getSubDirectory(dirPath: string): string[] {
  try {
    return readdirSync(dirPath)
      .filter((file) => !file.startsWith("."))
      .map((file) => resolve(dirPath, file))
      .filter((file) => {
        try {
          return statSync(file).isDirectory();
        } catch {
          return false;
        }
      });
  } catch (error) {
    // 权限错误交给调用方做冷却，避免每次唤起都重新触发系统弹窗
    if (isPermissionError(error)) {
      throw error;
    }
    console.error(`Failed to read directory: ${dirPath}`, error);
    return [];
  }
}
