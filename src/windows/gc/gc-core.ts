import { execFile } from "node:child_process";
import os from "node:os";
import { getGcSettings } from "./store";
import {
  classifyProcesses,
  isCleanupCandidate,
  OrphanObservations,
  parseProcessTable,
  processIdentity,
} from "./process-policy";
import { terminateProcesses } from "./termination";
import type { GcCleanResult, GcMemoryInfo, GcProcessInfo } from "./types";

const observations = new OrphanObservations();
let observationRevision = 0;
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
let scan: Promise<GcProcessInfo[]> | null = null;
let operation: Promise<unknown> = Promise.resolve();

/** Serialize manual termination with automatic/deep cleaning. A failed operation cannot jam the queue. */
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const next = operation.then(task);
  operation = next.catch(() => undefined);
  return next;
}

export function resetGcObservations(): void {
  observationRevision++;
  observations.clear();
}

export function listProcesses(): Promise<GcProcessInfo[]> {
  if (scan) return scan;
  scan = new Promise<string>((resolve, reject) => {
    if (process.platform !== "darwin") {
      reject(new Error("系统 GC 的进程清理目前仅支持 macOS"));
      return;
    }
    execFile(
      "/bin/ps",
      ["-axo", "pid=,ppid=,uid=,state=,%cpu=,rss=,etime=,lstart=,comm=", "-ww"],
      {
        timeout: 8000,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, LC_ALL: "C", LANG: "C" },
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout))
    );
  })
    .then((output) => {
      const procs = parseProcessTable(output);
      if (!procs.some((p) => p.pid === process.pid) || !procs.some((p) => p.pid === 1)) {
        throw new Error("进程快照不完整，已取消清理");
      }
      const settings = getGcSettings();
      const classified = classifyProcesses(procs, settings, process.pid, process.getuid?.() ?? -1);
      observations.reconcile(classified, settings.deepClean ? "deep" : "standard");
      return classified;
    })
    .finally(() => {
      scan = null;
    });
  return scan;
}

export function getMemoryInfo(): GcMemoryInfo {
  const totalMB = Math.round(os.totalmem() / 1024 / 1024);
  const freeMB = Math.round(os.freemem() / 1024 / 1024);
  const usedMB = totalMB - freeMB;
  return {
    totalMB,
    freeMB,
    usedMB,
    usedPercent: totalMB ? Math.round((usedMB / totalMB) * 100) : 0,
  };
}

function leafFirst(procs: GcProcessInfo[]): GcProcessInfo[] {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const depth = (p: GcProcessInfo): number => {
    const seen = new Set<number>();
    let parent = byPid.get(p.ppid);
    while (parent && !seen.has(parent.pid)) {
      seen.add(parent.pid);
      parent = byPid.get(parent.ppid);
    }
    return seen.size;
  };
  return [...procs].sort((a, b) => depth(b) - depth(a));
}

export function cleanGarbage(
  source: "auto" | "manual",
  mode: "standard" | "deep" = "standard",
  shouldContinue: () => boolean = () => true
): Promise<GcCleanResult> {
  return exclusive(async () => {
    const revision = observationRevision;
    const canContinue = (): boolean =>
      shouldContinue() && (source !== "auto" || revision === observationRevision);
    const result: GcCleanResult = {
      at: Date.now(),
      source,
      mode,
      killed: [],
      skipped: [],
      freedMB: 0,
      pendingCount: 0,
    };
    const attempted = new Set<string>();
    try {
      // Re-scan after each deep pass to discover helpers reparented while their app was exiting.
      for (let pass = 0; pass < (mode === "deep" ? 3 : 1); pass++) {
        if (!canContinue() || (source === "auto" && !getGcSettings().autoClean)) break;
        const settings = getGcSettings();
        const procs = await listProcesses();
        let targets: GcProcessInfo[];
        if (source === "auto") {
          const selected = observations.select(
            procs,
            mode,
            Date.now(),
            settings.orphanGraceSeconds,
            90000
          );
          targets = selected.ready;
          result.pendingCount = selected.pending;
        } else {
          const candidates = procs.filter((p) => isCleanupCandidate(p, mode));
          targets = candidates.filter((p) => p.elapsedSeconds >= settings.orphanGraceSeconds);
          result.pendingCount = candidates.length - targets.length;
          // Manual action still needs two independent snapshots; do not act on a transient exit.
          if (targets.length) await wait(1000);
        }
        targets = leafFirst(targets.filter((p) => !attempted.has(processIdentity(p))));
        if (!targets.length) break;
        for (const p of targets) attempted.add(processIdentity(p));
        const terminated = await terminateProcesses(targets, {
          read: listProcesses,
          signal: (pid, signal) => process.kill(pid, signal),
          wait,
          allowed: (p) =>
            canContinue() &&
            (source !== "auto" ||
              (getGcSettings().autoClean &&
                observations.isReady(p, Date.now(), getGcSettings().orphanGraceSeconds, 90000))) &&
            isCleanupCandidate(
              p,
              source === "auto" && !getGcSettings().deepClean ? "standard" : mode
            ),
        });
        result.killed.push(...terminated.killed);
        result.skipped.push(...terminated.skipped);
        if (terminated.error) {
          observations.clear();
          result.error = terminated.error;
          break;
        }
        if (!terminated.killed.length) break;
      }
    } catch (error) {
      observations.clear();
      result.error = error instanceof Error ? error.message : String(error);
    }
    result.at = Date.now();
    // RSS can contain shared pages; this is an occupancy estimate, not measured memory released.
    result.freedMB = result.killed.reduce((sum, p) => sum + p.rssMB, 0);
    return result;
  });
}

export function killProcessByPid(
  pid: number,
  startedAt: string
): Promise<{
  killed: boolean;
  name?: string;
  rssMB?: number;
  reason?: string;
}> {
  return exclusive(async () => {
    if (!Number.isSafeInteger(pid) || pid <= 1 || typeof startedAt !== "string" || !startedAt) {
      return { killed: false, reason: "无效的进程身份，请刷新进程列表" };
    }
    const target = (await listProcesses()).find((p) => p.pid === pid);
    if (!target || target.startedAt !== startedAt)
      return { killed: false, reason: "进程已退出或身份已改变，请刷新列表" };
    const allowed = (p: GcProcessInfo): boolean =>
      !p.tags.some((tag) => tag === "protected" || tag === "system" || tag === "zombie");
    if (!allowed(target))
      return { killed: false, name: target.name, reason: "系统、保护名单或僵尸进程，已拦截" };
    const result = await terminateProcesses([target], {
      read: listProcesses,
      signal: (id, signal) => process.kill(id, signal),
      wait,
      allowed,
    });
    return {
      killed: result.killed.length > 0,
      name: target.name,
      rssMB: target.rssMB,
      reason: result.error ?? result.skipped[0]?.reason,
    };
  });
}
