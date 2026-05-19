import { createWindowRef, openManagedSubWindow } from "@platform/electron/managedSubWindow";

const windowRef = createWindowRef();

export function createDisplayWindow(): void {
  openManagedSubWindow(windowRef, {
    width: 720,
    height: 520,
    title: "屏幕管理",
    hash: "display-manager",
    contextMenu: false,
  });
}
