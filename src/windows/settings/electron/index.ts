import { createWindowRef, openManagedSubWindow } from "@platform/electron/managedSubWindow";

const windowRef = createWindowRef();

export function createSettingsWindow(): void {
  openManagedSubWindow(windowRef, {
    width: 900,
    height: 700,
    title: "设置",
    hash: "settings",
  });
}
