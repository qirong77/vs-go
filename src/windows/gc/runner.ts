import type { WebContents } from "electron";
import { formatError } from "@shared/utils";
import { GcEvent } from "./events";
import { cleanGarbage, getMemoryInfo, listProcesses, resetGcObservations } from "./gc-core";
import { appendGcLog, getGcLog } from "./gc-log";
import { GcScheduler } from "./scheduler";
import { getGcSettings } from "./store";
import type { GcCleanResult, GcSnapshot } from "./types";

const BOOT_AT = Date.now();
const subscribers = new Set<WebContents>();
let lastCleanAt: number | null = null;
let lastCleanResult: GcCleanResult | null = null;
let nextRunAt: number | null = null;
let active: {
  source: "auto" | "manual";
  mode: "standard" | "deep";
  promise: Promise<GcCleanResult>;
} | null = null;

export function subscribeGc(webContents: WebContents): void {
  if (webContents.isDestroyed() || subscribers.has(webContents)) return;
  subscribers.add(webContents);
  webContents.once("destroyed", () => {
    subscribers.delete(webContents);
  });
}

export function notifyGcChanged(reason: string): void {
  for (const wc of subscribers) {
    if (wc.isDestroyed()) {
      subscribers.delete(wc);
      continue;
    }
    try {
      wc.send(GcEvent.PUSH, { reason });
    } catch {
      subscribers.delete(wc);
    }
  }
}

export function runCleanNow(
  source: "auto" | "manual",
  mode: "standard" | "deep" = "standard",
  shouldContinue: () => boolean = () => true
): Promise<GcCleanResult> {
  if (active) {
    if (source === "manual" && active.source === source && active.mode === mode)
      return active.promise;
    // Preserve a manual deep-clean request made during an automatic/standard run.
    return active.promise.then(() => runCleanNow(source, mode, shouldContinue));
  }
  const promise = (async (): Promise<GcCleanResult> => {
    let result: GcCleanResult;
    try {
      result = await cleanGarbage(source, mode, shouldContinue);
    } catch (error) {
      result = {
        at: Date.now(),
        source,
        mode,
        killed: [],
        skipped: [],
        freedMB: 0,
        pendingCount: 0,
        error: formatError(error),
      };
    }
    lastCleanAt = result.at;
    lastCleanResult = result;
    appendGcLog({
      time: result.at,
      source,
      action: "clean",
      message: `${source === "auto" ? "自动" : "手动"}${mode === "deep" ? "深度" : ""}清理${result.error ? "失败" : result.pendingCount ? "：候选观察中" : "完成"}`,
      killed: result.killed.map((p) => ({ pid: p.pid, name: p.name, rssMB: p.rssMB })),
      freedMB: result.freedMB,
      skipped: result.skipped,
      detail: result.error,
    });
    return result;
  })().finally(() => {
    active = null;
    notifyGcChanged("clean-finished");
  });
  active = { source, mode, promise };
  notifyGcChanged("clean-started");
  return promise;
}

const scheduler = new GcScheduler({
  settings: getGcSettings,
  run: (isCurrent) =>
    runCleanNow("auto", getGcSettings().deepClean ? "deep" : "standard", isCurrent),
  changed: (at) => {
    nextRunAt = at;
    notifyGcChanged("schedule");
  },
  now: Date.now,
  setTimer: (callback, ms) => {
    const timer = setTimeout(callback, ms);
    timer.unref();
    return timer;
  },
  clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
});

export function startGcRunner(): void {
  resetGcObservations();
  scheduler.start();
}

export function stopGcRunner(): void {
  scheduler.stop();
  resetGcObservations();
}

export async function buildSnapshot(): Promise<GcSnapshot> {
  const processes = await listProcesses();
  return {
    bootAt: BOOT_AT,
    memory: getMemoryInfo(),
    settings: getGcSettings(),
    processes,
    lastCleanAt,
    lastCleanResult,
    logEntries: getGcLog(),
    running: active !== null,
    nextRunAt,
  };
}
