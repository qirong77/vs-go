import { VS_GO_EVENT } from "./../../common/EVENT";
import { dialog, ipcMain } from "electron";
import { openFileByVscode } from "../utils/openFileByVsCode";
import { is } from "@electron-toolkit/utils";
import { IMainWindowFile } from "../../common/type";
import { execSync } from "child_process";
import { hide, setWindowSize } from "./MainWindow/MainWindow";
import { getMainWindowFiles } from "./MainWindow/MainWindowFileManager";
import { existsSync } from "fs";
import { vscodeBase64 } from "../../common/vscodeBase64";

ipcMain.on(VS_GO_EVENT.SET_SEARCH_WINDOW_HEIGHT, (_e, arg) => {
    !is.dev && setWindowSize(650, Math.floor(arg));
});
ipcMain.on(VS_GO_EVENT.OPEN_FILE, (_e, file: IMainWindowFile) => {
    hide();
    const filePath = file.filePath;
    if (!existsSync(filePath)) {
        dialog.showErrorBox("文件不存在", `${filePath} 不存在`);
        return;
    }
    // const isApp = file.filePath.includes('Applications')
    const isOpenFileByVsCode = file.useAppBase64 === vscodeBase64
    if(isOpenFileByVsCode) {
        openFileByVscode(filePath);
        return
    }
    const command = `open -R ${file.filePath}`;
    execSync(command);
    return
});
ipcMain.handle(VS_GO_EVENT.GET_FILES_LIST, async () => {
    const res = await getMainWindowFiles();
    return res;
});
