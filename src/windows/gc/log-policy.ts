import type { GcLogEntry } from "./types";

export const RETENTION_MS = 48 * 60 * 60 * 1000;
export const MAX_LOG_ENTRIES = 2000;
export const MAX_LOG_READ_BYTES = 4 * 1024 * 1024;

type LogTail = { content: string; truncated: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonnegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isProcess(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    isNonnegativeNumber(value.pid) &&
    Number.isSafeInteger(value.pid) &&
    typeof value.name === "string"
  );
}

export function isGcLogEntry(value: unknown): value is GcLogEntry {
  return (
    isRecord(value) &&
    isNonnegativeNumber(value.time) &&
    (value.source === "auto" || value.source === "manual") &&
    ["clean", "kill", "settings", "protect"].includes(value.action as string) &&
    typeof value.message === "string" &&
    isNonnegativeNumber(value.freedMB) &&
    (value.detail === undefined || typeof value.detail === "string") &&
    Array.isArray(value.killed) &&
    value.killed.every((item) => isProcess(item) && isNonnegativeNumber(item.rssMB)) &&
    Array.isArray(value.skipped) &&
    value.skipped.every((item) => isProcess(item) && typeof item.reason === "string")
  );
}

export function parseLogTail(tail: LogTail): { entries: GcLogEntry[]; changed: boolean } {
  // The first line may start inside a JSON record or a UTF-8 character.
  const newline = tail.content.indexOf("\n");
  const content = tail.truncated
    ? newline < 0
      ? ""
      : tail.content.slice(newline + 1)
    : tail.content;
  const entries: GcLogEntry[] = [];
  let changed = tail.truncated;
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (isGcLogEntry(value)) entries.push(value);
      else changed = true;
    } catch {
      changed = true;
    }
  }
  return { entries, changed };
}

function retain(entries: GcLogEntry[], now: number): GcLogEntry[] {
  return entries.filter((entry) => now - entry.time <= RETENTION_MS).slice(-MAX_LOG_ENTRIES);
}

function copy(entry: GcLogEntry): GcLogEntry {
  return {
    ...entry,
    killed: entry.killed.map((item) => ({ ...item })),
    skipped: entry.skipped.map((item) => ({ ...item })),
  };
}

/** Injected I/O keeps the policy testable without Electron or real log files. */
export function createGcLogStore(io: {
  read: () => LogTail;
  write: (entries: GcLogEntry[]) => void;
  now?: () => number;
}): { get: () => GcLogEntry[]; append: (entry: GcLogEntry) => void } {
  let entries: GcLogEntry[] | undefined;
  let changed = false;
  const now = io.now ?? Date.now;

  function loadAndPrune(): GcLogEntry[] {
    if (entries === undefined) {
      const parsed = parseLogTail(io.read());
      entries = parsed.entries;
      changed = parsed.changed;
    }
    const retained = retain(entries, now());
    changed ||= retained.length !== entries.length;
    entries = retained;
    return entries;
  }

  function persist(): void {
    if (changed && entries !== undefined) {
      io.write(entries);
      changed = false;
    }
  }

  return {
    get() {
      const current = loadAndPrune();
      persist();
      return current.map(copy);
    },
    append(entry) {
      if (!isGcLogEntry(entry)) return;
      const current = loadAndPrune();
      const retained = retain([...current, copy(entry)], now());
      changed ||=
        retained.length !== current.length || retained.some((item, i) => item !== current[i]);
      entries = retained;
      persist();
    },
  };
}
