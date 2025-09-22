import { basename, resolve } from "node:path";
import { getSubDirectory } from "../../utils/getSubDirectory";
import { finderBase64 } from "../../../common/finderBase64";
import { vscodeBase64 } from "../../../common/vscodeBase64";
import { IMainWindowFiles } from "../../../common/type";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";
import { getIconBuffers } from "../../utils/getIconPath";
export async function getMainWindowFiles() {
    const terminal = await getTerminallPath();
    const app = await getApp();
    const files = [...getWorkSpaceFiles(), ...getZshFile(),...terminal,...app];
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
                    },
                    {
                        fileName: basename(dir),
                        filePath: dir,
                        iconBase64: finderBase64,
                        useAppBase64: "",
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
        });
    }
    const zprofile = resolve(homedir(), ".zprofile");
    if (existsSync(zprofile)) {
        results.push({
            filePath: zprofile,
            fileName: ".zprofile",
            iconBase64: finderBase64,
            useAppBase64: vscodeBase64,
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
        },
    ];
}

async function getApp() {
    const apps = getSubDirectory('/Applications').filter((app) => {
        return app.endsWith('.app')
    })
    const files: IMainWindowFiles = []
    for (const app of apps) {
        const appIcon = await getIconBuffers([app]) || ''
        files.push({
            filePath: app,
            fileName: basename(app),
            iconBase64: appIcon,
            useAppBase64: '',
        })
    }
    return files
}