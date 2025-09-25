import { resolve } from "path";
import { homedir } from "os";
const ProjectPath = resolve(homedir(), "Desktop", "VsGo-Projects");
import { existsSync } from "fs";
import { showErrorDialog } from "../electron/Dialog";
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
vsGoConfig.workSpaceDirectories.concat(vsGoConfig.workSpaceFiles).forEach((filePath) => {
  if (!existsSync(filePath)) {
    showErrorDialog("配置文件不存在:" + `${filePath} 不存在`);
  }
});
export { vsGoConfig };
