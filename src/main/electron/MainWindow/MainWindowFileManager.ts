import { basename, resolve } from "node:path";
import { getSubDirectory } from "../../utils/getSubDirectory";
import { finderBase64 } from "../../../common/finderBase64";
import { vscodeBase64 } from "../../../common/vscodeBase64";
import { IMainWindowFiles } from "../../../common/type";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";
import { getIconBuffers } from "../../utils/getIconPath";
console.log(getIconBuffers)
// import { getVsCodeOpenedFolder } from "../../utils/getVsCodeOpenedFolder";
// import { readFileSync } from "node:fs";
// import { dialog } from "electron";
// import { debounce } from "../../../common/debounce";
/* TEST-WORKER
const worker = new Worker(new URL("../test-worker.js", import.meta.url));
// 监听来自 Worker 线程的消息
worker.on("message", (result) => {
  dialog.showMessageBox(result)
  console.log("Long task result:", result);
});
worker.postMessage("hello");
*/
export async function getMainWindowFiles() {
    const timeStart = Date.now();
    const terminal = await getTerminallPath();
    const files = [...getWorkSpaceFiles(), ...getZshFile(),...terminal];
    console.log((Date.now() - timeStart) / 1000);
    return files;
}

function getWorkSpaceFiles() {
    const ProjectPath = resolve(homedir(), "Desktop", "VsGo-Projects");
    if (!existsSync(ProjectPath)) {
        mkdirSync(ProjectPath);
    }
    const DesktopPath = resolve(homedir(), "Desktop");
    const windowFiles: IMainWindowFiles = [ProjectPath, DesktopPath]
        .map((dir) => {
            const subDirs = getSubDirectory(dir);
            const files = subDirs.map((dir) => {
                return [
                    {
                        fileName: basename(dir),
                        filePath: dir,
                        iconBase64: finderBase64,
                        useAppBase64: vscodeBase64,

                        isApp: false,
                    },
                    {
                        fileName: basename(dir),
                        filePath: dir,
                        iconBase64: finderBase64,
                        useAppBase64: "",
                        isApp: false,
                    },
                ];
            });
            return files;
        })
        .flat(3);
    return windowFiles;
}

function getZshFile() {
    const results: IMainWindowFiles = [];
    const zshrc = resolve(homedir(), ".zshrc");
    if (existsSync(zshrc)) {
        results.push({
            filePath: zshrc,
            fileName: ".zshrc",
            iconBase64: finderBase64,
            useAppBase64: vscodeBase64,
            isApp: false,
        });
    }
    const zprofile = resolve(homedir(), ".zprofile");
    if (existsSync(zprofile)) {
        results.push({
            filePath: zprofile,
            fileName: ".zprofile",
            iconBase64: finderBase64,
            useAppBase64: vscodeBase64,
            isApp: false,
        });
    }
    return results;
}

async function getTerminallPath() {
    const terminalPasth = "/System/Applications/Utilities/Terminal.app";
    const terMinalIcon = await getIconBuffers([terminalPasth]);
    return [
        {
            filePath: terminalPasth,
            fileName: "Terminal",
            iconBase64: terMinalIcon,
            useAppBase64: '',
            isApp: true,
        },
    ];
}
