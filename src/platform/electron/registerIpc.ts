import { registerFileHandlers } from "@windows/main-window/ipc";
import { registerBrowserHandlers } from "@windows/browser/ipc";
import { registerCookieHandlers } from "@windows/cookie-manager/ipc";
import { registerSettingsHandlers } from "@windows/app-setting/ipc";
import { registerWindowScriptHandlers } from "@windows/script-editor/ipc";
import { registerLogHandlers } from "@platform/log/ipc";

export function registerAllIpcHandlers(): void {
  registerFileHandlers();
  registerBrowserHandlers();
  registerCookieHandlers();
  registerSettingsHandlers();
  registerWindowScriptHandlers();
  registerLogHandlers();
}

registerAllIpcHandlers();
