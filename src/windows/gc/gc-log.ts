import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { GcLogEntry } from "./types";
import { createGcLogStore, MAX_LOG_READ_BYTES } from "./log-policy";

function logFilePath(): string {
  return path.join(app.getPath("temp"), "vsgo-gc.log");
}

function readTail(): { content: string; truncated: boolean } {
  let fd: number | undefined;
  try {
    fd = fs.openSync(logFilePath(), "r");
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, MAX_LOG_READ_BYTES);
    const offset = size - length;
    const buffer = Buffer.alloc(length);
    let bytesRead = 0;
    while (bytesRead < length) {
      const count = fs.readSync(fd, buffer, bytesRead, length - bytesRead, offset + bytesRead);
      if (count === 0) break;
      bytesRead += count;
    }
    return { content: buffer.toString("utf8", 0, bytesRead), truncated: offset > 0 };
  } catch {
    return { content: "", truncated: false };
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch (error) {
        console.warn("[GC] Failed to close log file", error);
      }
    }
  }
}

function write(entries: GcLogEntry[]): void {
  try {
    const content = entries.length ? entries.map((e) => JSON.stringify(e)).join("\n") + "\n" : "";
    fs.writeFileSync(logFilePath(), content, "utf8");
  } catch (error) {
    console.warn("[GC] Failed to write log file", error);
  }
}

const store = createGcLogStore({ read: readTail, write });

export function appendGcLog(entry: GcLogEntry): void {
  store.append(entry);
}

export function getGcLog(): GcLogEntry[] {
  return store.get();
}
