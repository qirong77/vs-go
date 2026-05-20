import type { WebContents } from "electron";
import { LogEvent } from "./events";
import type { LogEntry, LogLevel } from "./types";

const MAX_ENTRIES = 1000;

let nextId = 1;
const entries: LogEntry[] = [];
const subscribers = new Set<WebContents>();

function formatDetail(detail: Record<string, unknown> | undefined): string | undefined {
  if (!detail) return undefined;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export function subscribeLogViewer(webContents: WebContents): void {
  subscribers.add(webContents);
  const remove = (): void => {
    subscribers.delete(webContents);
  };
  webContents.once("destroyed", remove);
}

export function appendLogEntry(input: {
  level?: LogLevel;
  scope: string;
  message: string;
  detail?: Record<string, unknown>;
}): LogEntry {
  const entry: LogEntry = {
    id: nextId++,
    time: new Date().toISOString(),
    level: input.level ?? "info",
    scope: input.scope,
    message: input.message,
    detail: formatDetail(input.detail),
  };

  entries.push(entry);
  while (entries.length > MAX_ENTRIES) {
    entries.shift();
  }

  for (const wc of subscribers) {
    if (!wc.isDestroyed()) {
      wc.send(LogEvent.APPEND, entry);
    }
  }

  const detailSuffix = entry.detail ? ` ${entry.detail}` : "";
  console.log(`[VsGo][${entry.scope}] ${entry.message}${detailSuffix}`);

  return entry;
}

export function getAllLogEntries(): LogEntry[] {
  return [...entries];
}

export function clearLogEntries(): void {
  entries.length = 0;
  for (const wc of subscribers) {
    if (!wc.isDestroyed()) {
      wc.send(LogEvent.CLEARED);
    }
  }
}
