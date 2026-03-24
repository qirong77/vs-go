import { BrowserWindow, ipcMain, screen } from "electron";
import { VS_GO_EVENT } from "../../../common/EVENT";

const overlayWindows = new Map<number, BrowserWindow>();

/** 亮度值 0–100，100 = 最亮（无遮挡），0 = 全黑 */
const brightnessMap = new Map<number, number>();

function getOrCreateOverlay(displayId: number): BrowserWindow | null {
  if (overlayWindows.has(displayId)) {
    const win = overlayWindows.get(displayId)!;
    if (!win.isDestroyed()) return win;
    overlayWindows.delete(displayId);
  }

  const display = screen.getAllDisplays().find((d) => d.id === displayId);
  if (!display) return null;

  const { x, y, width, height } = display.bounds;

  const overlay = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  overlay.setIgnoreMouseEvents(true);
  overlay.setVisibleOnAllWorkspaces(true);

  overlay.loadURL(
    `data:text/html,<html><body style="margin:0;background:rgba(0,0,0,0);"></body></html>`,
  );

  overlay.once("ready-to-show", () => overlay.showInactive());

  overlayWindows.set(displayId, overlay);
  return overlay;
}

function applyBrightness(displayId: number, brightness: number): void {
  const clamped = Math.max(0, Math.min(100, brightness));
  brightnessMap.set(displayId, clamped);

  if (clamped === 100) {
    const overlay = overlayWindows.get(displayId);
    if (overlay && !overlay.isDestroyed()) {
      overlay.close();
    }
    overlayWindows.delete(displayId);
    return;
  }

  const overlay = getOrCreateOverlay(displayId);
  if (!overlay) return;

  const opacity = (100 - clamped) / 100;
  overlay.setOpacity(opacity);
}

export function registerDisplayHandlers(): void {
  ipcMain.handle(VS_GO_EVENT.DISPLAY_GET_ALL, () => {
    const displays = screen.getAllDisplays();
    return displays.map((d) => ({
      id: d.id,
      label: d.label || `Display ${d.id}`,
      bounds: d.bounds,
      size: d.size,
      scaleFactor: d.scaleFactor,
      rotation: d.rotation,
      internal: d.internal,
      brightness: brightnessMap.get(d.id) ?? 100,
    }));
  });

  ipcMain.handle(
    VS_GO_EVENT.DISPLAY_SET_BRIGHTNESS,
    (_event, displayId: number, brightness: number) => {
      try {
        applyBrightness(displayId, brightness);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );
}

export function destroyAllOverlays(): void {
  for (const [, win] of overlayWindows) {
    if (!win.isDestroyed()) win.close();
  }
  overlayWindows.clear();
  brightnessMap.clear();
}
