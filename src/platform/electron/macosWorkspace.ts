import { app, BrowserWindow } from "electron";

/** macOS 跨 Space 唤起：join all → show → 延迟 pin 到当前 Space（electron#8734 / kando#461） */
const WORKSPACE_OPTS: Electron.VisibleOnAllWorkspacesOptions = {
  visibleOnFullScreen: true,
  skipTransformProcessType: true,
};

const PIN_DELAY_MS = 100;

/** 启动时调用：accessory 策略减少全局快捷键激活应用时的 Space 跳转 */
export function configureMacOsLauncherApp(): void {
  if (process.platform !== "darwin") return;
  app.setActivationPolicy("accessory");
}

export function prepareWindowForActiveSpace(window: BrowserWindow): void {
  if (process.platform !== "darwin") return;
  window.setVisibleOnAllWorkspaces(true, WORKSPACE_OPTS);
}

export function schedulePinWindowToActiveSpace(window: BrowserWindow): void {
  if (process.platform !== "darwin") return;
  setTimeout(() => {
    if (window.isDestroyed()) return;
    window.setVisibleOnAllWorkspaces(false, WORKSPACE_OPTS);
  }, PIN_DELAY_MS);
}
