import type { FC } from "react";
import MainWindow from "@windows/main-window/renderer/MainWindow";
import AppSetting from "@windows/app-setting/renderer/AppSetting";
import BrowserSetting from "@windows/browser/renderer/BrowserSetting";
import CookieManager from "@windows/cookie-manager/renderer/CookieManager";
import DisplayManager from "@windows/display-manager/renderer/DisplayManager";
import ScriptEditor from "@windows/script-editor/renderer/ScriptEditor";
import TabbedBrowser from "@windows/browser/renderer/TabbedBrowser";
import Settings from "@windows/settings/renderer/Settings";
import FloatingOverlay from "@windows/browser/renderer/FloatingOverlay";

/** hash 路由 → 根组件（与各窗口 createSubWindow 的 hash 一致） */
export const RENDERER_ROUTES: Record<string, FC> = {
  "main-window": MainWindow,
  "browser-setting": BrowserSetting,
  "cookie-manager": CookieManager,
  "app-setting": AppSetting,
  "display-manager": DisplayManager,
  "script-editor": ScriptEditor,
  "tabbed-browser": TabbedBrowser,
  settings: Settings,
  "floating-overlay": FloatingOverlay,
};

export function resolveRouteComponent(hash: string): FC {
  const match = Object.entries(RENDERER_ROUTES).find(([key]) => hash.includes(key));
  return match?.[1] ?? MainWindow;
}
