import type { FC } from "react";
import MainWindow from "@windows/main-window/renderer/MainWindow";
import CookieManager from "@windows/cookie-manager/renderer/CookieManager";
import TabbedBrowser from "@windows/browser/renderer/TabbedBrowser";
import Settings from "@windows/settings/renderer/Settings";
import LogViewer from "@windows/log-viewer/renderer/LogViewer";
import FloatingOverlay from "@windows/browser/renderer/FloatingOverlay";

/** hash 路由 → 根组件（与各窗口 createSubWindow 的 hash 一致） */
export const RENDERER_ROUTES: Record<string, FC> = {
  "main-window": MainWindow,
  "cookie-manager": CookieManager,
  "tabbed-browser": TabbedBrowser,
  settings: Settings,
  "log-viewer": LogViewer,
  "floating-overlay": FloatingOverlay,
};

export function resolveRouteComponent(hash: string): FC {
  const normalized = hash.replace(/^#\/?/, "");
  const match = Object.entries(RENDERER_ROUTES).find(([key]) => normalized.startsWith(key));
  return match?.[1] ?? MainWindow;
}
