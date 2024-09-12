import { resolve } from "path";
import { homedir } from "os";
const ProjectPath = resolve(homedir(), "Desktop", "VsGo-Projects");
import { existsSync } from "fs";
import { showErrorDialog } from "../electron/Dialog";
import { mkdirSync } from "node:original-fs";
import { getDefaultWorkSpaceFile } from "./getDefaultWorkSpaceFile";
import { app } from "electron";
import { execFileSync } from "child_process";
if (!existsSync(ProjectPath)) {
  mkdirSync(ProjectPath);
}
const vsGoConfig = {
  workSpaceDirectories: [ProjectPath, resolve(homedir(), "Desktop")],
  workSpaceFiles: getDefaultWorkSpaceFile(),
  codeCommandPath: "/usr/local/bin/code",
  vscodeStausFilePath: resolve(homedir(), "Desktop", ".qirong-vscode-window-status.json"),
};
vsGoConfig.workSpaceDirectories.concat(vsGoConfig.workSpaceFiles).forEach((filePath) => {
  if (!existsSync(filePath)) {
    showErrorDialog("配置文件不存在:" + `${filePath} 不存在`);
  }
});
app.whenReady().then(()=>{
  setTimeout(()=>{
    try {
      execFileSync('code -s')
    } catch (error) {
      showErrorDialog('未检测到code命令,在VsCode中使用Command+Shift+P,搜索code进行安装qr')
    }
  },3000)
})
export { vsGoConfig };
