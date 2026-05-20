import { appendLogEntry } from "./store";
import type { LogLevel } from "./types";

export function vsgoLog(
  scope: string,
  message: string,
  options?: { level?: LogLevel; detail?: Record<string, unknown> }
): void {
  appendLogEntry({
    scope,
    message,
    level: options?.level,
    detail: options?.detail,
  });
}
