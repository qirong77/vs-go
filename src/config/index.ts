import { resolve } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";

const projectPath = resolve(homedir(), "Desktop", "VsGo-Projects");
if (!existsSync(projectPath)) {
  mkdirSync(projectPath);
}

const shellConfigFiles = [".zshrc", ".zprofile"]
  .map((name) => resolve(homedir(), name))
  .filter((p) => existsSync(p));

export const vsGoConfig = {
  workSpaceDirectories: [projectPath, resolve(homedir(), "Desktop")],
  shellConfigFiles,
  codeAppPath: "/Applications/Visual Studio Code.app",
  cursorAppPath: "/Applications/Cursor.app",
};
