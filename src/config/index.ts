import { resolve } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";

const desktopPath = resolve(homedir(), "Desktop");
const projectPath = resolve(desktopPath, "VsGo-Projects");

function ensureProjectPath(): string {
  try {
    if (!existsSync(projectPath)) {
      mkdirSync(projectPath, { recursive: true });
    }
  } catch (error) {
    console.error(`Failed to ensure project path: ${projectPath}`, error);
  }
  return projectPath;
}

const shellConfigFiles = [".zshrc", ".zprofile"]
  .map((name) => resolve(homedir(), name))
  .filter((p) => existsSync(p));

export const vsGoConfig = {
  /**
   * 扫描 VsGo-Projects + 桌面根目录（桌面 .app / 文件夹）。
   * 对桌面的访问失败会在 fileManager 里冷却，避免反复弹权限窗。
   */
  get workSpaceDirectories(): string[] {
    return [ensureProjectPath(), desktopPath];
  },
  shellConfigFiles,
  codeAppPath: "/Applications/Visual Studio Code.app",
  cursorAppPath: "/Applications/Cursor.app",
};
