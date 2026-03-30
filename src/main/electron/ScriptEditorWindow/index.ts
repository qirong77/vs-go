import { BrowserWindow } from "electron";
import { createSubWindow, presentWindowOnCurrentDesktop } from "../createWindow";
import { setupContextMenu } from "../contextMenu";

let scriptEditorWindow: BrowserWindow | null = null;

export function createScriptEditorWindow(): void {
  if (scriptEditorWindow && !scriptEditorWindow.isDestroyed()) {
    presentWindowOnCurrentDesktop(scriptEditorWindow);
    return;
  }

  scriptEditorWindow = createSubWindow({
    width: 900,
    height: 700,
    title: "脚本",
    hash: "script-editor",
  });

  setupContextMenu(scriptEditorWindow);

  scriptEditorWindow.on("closed", () => {
    scriptEditorWindow = null;
  });

  presentWindowOnCurrentDesktop(scriptEditorWindow);
}
