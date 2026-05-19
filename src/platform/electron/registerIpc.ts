import { registerFileHandlers } from "@windows/main-window/ipc";
import { registerBrowserHandlers } from "@windows/browser/ipc";
import { registerCookieHandlers } from "@windows/cookie-manager/ipc";
import { registerNotesHandlers } from "@windows/user-notes/ipc";
import { registerSettingsHandlers } from "@windows/app-setting/ipc";
import { registerDisplayHandlers } from "@windows/display-manager/ipc";
import { registerWindowScriptHandlers } from "@windows/script-editor/ipc";

export function registerAllIpcHandlers(): void {
  registerFileHandlers();
  registerBrowserHandlers();
  registerCookieHandlers();
  registerNotesHandlers();
  registerSettingsHandlers();
  registerDisplayHandlers();
  registerWindowScriptHandlers();
}

registerAllIpcHandlers();
