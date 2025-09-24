import { BrowserItem } from "../main/electron/store";
export type IMainWindowFile = { useAppBase64: string; iconBase64: string; filePath: string; fileName: string; browser?: BrowserItem };
export type IMainWindowFiles = IMainWindowFile[];
