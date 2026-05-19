import { createWindowRef, openManagedSubWindow } from "@platform/electron/managedSubWindow";

const windowRef = createWindowRef();

export function createAppSettingWindow(): void {
  openManagedSubWindow(windowRef, {
    width: 480,
    height: 360,
    title: "App 设置",
    hash: "app-setting",
    resizable: false,
  });
}
