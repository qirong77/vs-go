import { resolve } from "path";
import { homedir } from "os";
const ProjectPath = resolve(homedir(), "Desktop", "VsGo-Projects");
import { existsSync } from "fs";
import { mkdirSync } from "node:original-fs";
import { getDefaultWorkSpaceFile } from "./getDefaultWorkSpaceFile";
if (!existsSync(ProjectPath)) {
  mkdirSync(ProjectPath);
}
const vsGoConfig = {
  workSpaceDirectories: [ProjectPath, resolve(homedir(), "Desktop")],
  workSpaceFiles: getDefaultWorkSpaceFile(),
  codeAppPath: "/Applications/Visual Studio Code.app",
};
export { vsGoConfig };
