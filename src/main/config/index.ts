import { resolve } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";
import { getDefaultWorkSpaceFile } from "./getDefaultWorkSpaceFile";

const ProjectPath = resolve(homedir(), "Desktop", "VsGo-Projects");

if (!existsSync(ProjectPath)) {
  mkdirSync(ProjectPath);
}

export const vsGoConfig = {
  workSpaceDirectories: [ProjectPath, resolve(homedir(), "Desktop")],
  workSpaceFiles: getDefaultWorkSpaceFile(),
  codeAppPath: "/Applications/Visual Studio Code.app",
  cursorAppPath: "/Applications/Cursor.app",
};
