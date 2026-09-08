import type { GcKilledItem, GcProcessInfo, GcSkippedItem } from "./types";

export interface TerminationEnvironment {
  read: () => Promise<GcProcessInfo[]>;
  signal: (pid: number, signal: "SIGTERM" | "SIGKILL") => void;
  wait: (ms: number) => Promise<void>;
  allowed: (process: GcProcessInfo) => boolean;
}

function sameProcess(a: GcProcessInfo, b: GcProcessInfo): boolean {
  return a.pid === b.pid && a.startedAt === b.startedAt && a.uid === b.uid && a.path === b.path;
}

/** Shared by manual and automatic cleanup; never signal solely on a previously seen PID. */
export async function terminateProcesses(
  targets: GcProcessInfo[],
  env: TerminationEnvironment
): Promise<{ killed: GcKilledItem[]; skipped: GcSkippedItem[]; error?: string }> {
  const killed: GcKilledItem[] = [];
  const skipped: GcSkippedItem[] = [];
  const completed = new Set<number>();
  const signaled = new Set<number>();
  const skip = (p: GcProcessInfo, reason: string): void => {
    skipped.push({ pid: p.pid, name: p.name, reason });
    completed.add(p.pid);
  };
  const recordExit = (p: GcProcessInfo): void => {
    killed.push({ pid: p.pid, name: p.name, path: p.path, rssMB: p.rssMB });
    completed.add(p.pid);
  };
  if (!targets.length) return { killed, skipped };
  try {
    for (const signal of ["SIGTERM", "SIGKILL"] as const) {
      const snapshot = new Map((await env.read()).map((p) => [p.pid, p]));
      let sent = false;
      for (const target of targets) {
        if (completed.has(target.pid)) continue;
        const current = snapshot.get(target.pid);
        if (!current || !sameProcess(target, current) || current.state.startsWith("Z")) {
          if (signaled.has(target.pid)) recordExit(target);
          else skip(target, "进程已退出或身份已改变");
          continue;
        }
        if (!env.allowed(current)) {
          skip(target, "保护设置或进程归属已变化，已取消终止");
          continue;
        }
        try {
          env.signal(current.pid, signal);
          signaled.add(current.pid);
          sent = true;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === "ESRCH" && signaled.has(target.pid)) recordExit(target);
          else
            skip(
              target,
              code === "ESRCH" ? "进程已自行退出" : `发送 ${signal} 失败：${code ?? String(error)}`
            );
        }
      }
      // Batch waits: avoid a separate delay per process and give helpers time to exit gracefully.
      if (sent) await env.wait(signal === "SIGTERM" ? 2000 : 300);
      if (completed.size === targets.length) return { killed, skipped };
    }
    const remaining = new Map((await env.read()).map((p) => [p.pid, p]));
    for (const target of targets) {
      if (completed.has(target.pid)) continue;
      const current = remaining.get(target.pid);
      if (!current || !sameProcess(target, current) || current.state.startsWith("Z"))
        recordExit(target);
      else skip(target, "进程尚未退出");
    }
    return { killed, skipped };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const p of targets) if (!completed.has(p.pid)) skip(p, "无法复核进程状态，已停止后续信号");
    return { killed, skipped, error: message };
  }
}
