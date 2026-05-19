import { createWindowRef, openManagedSubWindow } from "@platform/electron/managedSubWindow";

const windowRef = createWindowRef();

export function createScriptEditorWindow(): void {
  openManagedSubWindow(windowRef, {
    width: 900,
    height: 700,
    title: "脚本",
    hash: "script-editor",
  });
}
