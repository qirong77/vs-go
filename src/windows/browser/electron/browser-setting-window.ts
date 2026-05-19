import { createWindowRef, openManagedSubWindow } from "@platform/electron/managedSubWindow";

const windowRef = createWindowRef();

export function createBrowserSettingWindow(): void {
  openManagedSubWindow(windowRef, {
    width: 800,
    height: 600,
    title: "浏览器设置",
    hash: "browser-setting",
  });
}
