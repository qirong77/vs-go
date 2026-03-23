import { registerFileHandlers } from "./file";
import { registerBrowserHandlers } from "./browser";
import { registerCookieHandlers } from "./cookie";
import { registerNotesHandlers } from "./notes";
import { registerSettingsHandlers } from "./settings";

export function registerAllIpcHandlers(): void {
  registerFileHandlers();
  registerBrowserHandlers();
  registerCookieHandlers();
  registerNotesHandlers();
  registerSettingsHandlers();
}
