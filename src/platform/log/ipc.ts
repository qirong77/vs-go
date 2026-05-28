import { ipcMain } from "electron";
import { LogEvent } from "./events";
import { clearLogEntries, getAllLogEntries } from "./buffer";

export function registerLogHandlers(): void {
  ipcMain.handle(LogEvent.GET_ALL, () => getAllLogEntries());
  ipcMain.on(LogEvent.CLEAR, () => clearLogEntries());
}
