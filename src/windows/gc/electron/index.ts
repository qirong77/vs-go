import type { BrowserWindow, WebContents } from "electron";
import { createWindowRef, openManagedSubWindow } from "@platform/electron/managedSubWindow";
import { subscribeGc } from "@windows/gc/runner";

const windowRef = createWindowRef();

export function isGcWindowSender(sender: WebContents): boolean {
  return (
    !!windowRef.current &&
    !windowRef.current.isDestroyed() &&
    windowRef.current.webContents === sender
  );
}

export function createGcWindow(): BrowserWindow {
  return openManagedSubWindow(windowRef, {
    width: 1120,
    height: 760,
    title: "系统 GC",
    hash: "gc",
    onCreated: (window) => {
      window.webContents.on("will-navigate", (event) => event.preventDefault());
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("did-finish-load", () => {
        subscribeGc(window.webContents);
      });
      window.on("closed", () => {
        windowRef.current = null;
      });
    },
    onReuse: (window) => {
      subscribeGc(window.webContents);
    },
  });
}
