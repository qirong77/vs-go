import path from "node:path";
import type { GcProcessInfo, GcSettings } from "./types";

/** Headerless ps output, with LC_ALL=C so lstart always contains five fields. */
const PS_LINE =
  /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\d+(?:\.\d+)?)\s+(\d+)\s+([\d:-]+)\s+(\S+\s+\S+\s+\d+\s+[\d:]+\s+\d{4})\s+(.+)$/;

export function parseElapsed(value: string): number {
  if (!/^(?:\d+-)?\d+:\d{2}(?::\d{2})?$/.test(value)) {
    throw new Error(`无法解析进程运行时间：${value}`);
  }
  const [days, clock] = value.includes("-") ? value.split("-") : ["0", value];
  const parts = clock.split(":").map(Number);
  if (parts.slice(-2).some((n, index) => (parts.length === 3 || index === 1) && n >= 60)) {
    throw new Error(`无法解析进程运行时间：${value}`);
  }
  const seconds = Number(days) * 86400 + parts.reduce((total, n) => total * 60 + n, 0);
  if (!Number.isSafeInteger(seconds)) throw new Error(`无法解析进程运行时间：${value}`);
  return seconds;
}

export function parseProcessTable(output: string): GcProcessInfo[] {
  const procs: GcProcessInfo[] = [];
  const pids = new Set<number>();
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const match = PS_LINE.exec(line);
    // A partial/malformed snapshot cannot establish that an application's parent is absent.
    if (!match) throw new Error("进程快照格式异常，已取消清理");
    const [, pid, ppid, uid, state, cpu, rss, elapsed, startedAt, executable] = match;
    if (
      [pid, ppid, uid, rss].some((value) => !Number.isSafeInteger(Number(value))) ||
      !Number.isFinite(Number(cpu)) ||
      pids.has(Number(pid))
    ) {
      throw new Error("进程快照数据异常，已取消清理");
    }
    pids.add(Number(pid));
    const executablePath = executable.trim();
    if (!executablePath) throw new Error("进程快照缺少可执行路径，已取消清理");
    procs.push({
      pid: Number(pid),
      ppid: Number(ppid),
      uid: Number(uid),
      state,
      cpu: Number(cpu),
      rssMB: Math.round(Number(rss) / 1024),
      elapsedSeconds: parseElapsed(elapsed),
      startedAt: startedAt.replace(/\s+/g, " "),
      path: executablePath,
      name: path.basename(executablePath),
      tags: [],
    });
  }
  if (!procs.length) throw new Error("未读取到有效进程快照，已取消清理");
  return procs;
}

export function processIdentity(p: GcProcessInfo): string {
  return `${p.pid}:${p.uid}:${p.startedAt}:${p.path}`;
}

export function matchesProtection(p: GcProcessInfo, rules: string[]): boolean {
  const executable = p.path.toLowerCase();
  const name = p.name.toLowerCase();
  return rules.some((rule) => {
    const value = rule.trim().toLowerCase();
    return value.length > 0 && (executable.includes(value) || name === value);
  });
}

function applicationBundle(executable: string): string | null {
  return /^(\/.*?\.app)\/Contents\//.exec(executable)?.[1] ?? null;
}

/** Limit automatic candidates to helper executables, excluding crash reporters/updaters. */
function helperBundle(p: GcProcessInfo): string | null {
  const match = /^(\/.*?\.app)\/Contents\/Frameworks\/.+\.app\/Contents\/MacOS\/([^/]+)$/.exec(
    p.path
  );
  return match && /helper/i.test(match[2]) && !/crashpad|crashreport|updater/i.test(match[2])
    ? match[1]
    : null;
}

export function isCleanupCandidate(p: GcProcessInfo, mode: "standard" | "deep"): boolean {
  return (
    !p.tags.some((tag) => tag === "protected" || tag === "system" || tag === "zombie") &&
    (p.tags.includes("orphan-helper") || (mode === "deep" && p.tags.includes("orphan-descendant")))
  );
}

export function classifyProcesses(
  procs: GcProcessInfo[],
  settings: GcSettings,
  selfPid: number,
  uid: number
): GcProcessInfo[] {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const protectedPids = new Set<number>([selfPid]);
  // Protect the launcher/terminal ancestry as well as all of VsGo's child processes.
  let ancestor = byPid.get(selfPid);
  while (ancestor && ancestor.ppid > 1 && !protectedPids.has(ancestor.ppid)) {
    protectedPids.add(ancestor.ppid);
    ancestor = byPid.get(ancestor.ppid);
  }
  const ownBundle = applicationBundle(byPid.get(selfPid)?.path ?? "");
  for (const p of procs) {
    if (
      matchesProtection(p, settings.protected) ||
      (ownBundle && applicationBundle(p.path) === ownBundle)
    ) {
      protectedPids.add(p.pid);
    }
  }
  const children = new Map<number, GcProcessInfo[]>();
  for (const p of procs) {
    const siblings = children.get(p.ppid) ?? [];
    siblings.push(p);
    children.set(p.ppid, siblings);
  }
  // Only descend from self and explicit protection matches, not every ancestor's siblings.
  const queue = procs.filter(
    (p) =>
      p.pid === selfPid ||
      matchesProtection(p, settings.protected) ||
      (ownBundle && applicationBundle(p.path) === ownBundle)
  );
  const visited = new Set<number>();
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (visited.has(p.pid)) continue;
    visited.add(p.pid);
    protectedPids.add(p.pid);
    queue.push(...(children.get(p.pid) ?? []));
  }

  const activeBundles = new Set<string>();
  for (const p of procs) {
    const main = /^(\/.*?\.app)\/Contents\/MacOS\//.exec(p.path);
    // Even a zombie main process means teardown has not completed yet.
    if (main) activeBundles.add(main[1]);
    p.tags = [];
    delete p.cleanupReason;
    if (protectedPids.has(p.pid) || uid < 0 || p.uid !== uid) p.tags.push("protected");
    if (
      p.pid <= 1 ||
      p.uid === 0 ||
      p.path.startsWith("/System/") ||
      p.path.startsWith("/usr/libexec/") ||
      p.path.startsWith("/usr/sbin/") ||
      p.path.startsWith("/sbin/")
    )
      p.tags.push("system");
    if (p.state.startsWith("Z")) p.tags.push("zombie");
    if (p.cpu >= settings.cpuHighThreshold) p.tags.push("high-cpu");
    if (p.rssMB >= settings.memHighThresholdMB) p.tags.push("high-mem");
  }

  const orphanQueue: Array<{ proc: GcProcessInfo; bundle: string; root: number }> = [];
  for (const p of procs) {
    const bundle = helperBundle(p);
    // Missing parents other than launchd can indicate a snapshot race; wait until reparented.
    if (
      !bundle ||
      p.ppid !== 1 ||
      activeBundles.has(bundle) ||
      p.tags.some((t) => t === "protected" || t === "system" || t === "zombie")
    )
      continue;
    p.tags.push("orphan-helper");
    p.cleanupReason = "所属应用已退出，Helper 已由 launchd 接管；终止前将再次复核";
    orphanQueue.push({ proc: p, bundle, root: p.pid });
  }
  const orphanSeen = new Set<number>();
  for (let i = 0; i < orphanQueue.length; i++) {
    const { proc, bundle, root } = orphanQueue[i];
    if (orphanSeen.has(proc.pid)) continue;
    orphanSeen.add(proc.pid);
    for (const child of children.get(proc.pid) ?? []) {
      if (
        helperBundle(child) !== bundle ||
        child.tags.some((t) => t === "protected" || t === "system" || t === "zombie")
      )
        continue;
      child.tags.push("orphan-descendant");
      child.cleanupReason = `同一应用的残留 Helper 子进程，孤儿根 PID ${root}`;
      orphanQueue.push({ proc: child, bundle, root });
    }
  }
  return procs;
}

/** Cleaner scans advance observations; any fresh snapshot can invalidate an observation. */
export class OrphanObservations {
  private seen = new Map<string, { since: number; last: number }>();

  clear(): void {
    this.seen.clear();
  }

  reconcile(procs: GcProcessInfo[], mode: "standard" | "deep"): void {
    const current = new Set(procs.filter((p) => isCleanupCandidate(p, mode)).map(processIdentity));
    for (const key of this.seen.keys()) if (!current.has(key)) this.seen.delete(key);
  }

  isReady(p: GcProcessInfo, now: number, graceSeconds: number, maxGapMs: number): boolean {
    const observation = this.seen.get(processIdentity(p));
    return (
      !!observation &&
      now >= observation.last &&
      now - observation.last <= maxGapMs &&
      now - observation.since >= graceSeconds * 1000 &&
      p.elapsedSeconds >= graceSeconds
    );
  }

  select(
    procs: GcProcessInfo[],
    mode: "standard" | "deep",
    now: number,
    graceSeconds: number,
    maxGapMs: number
  ): { ready: GcProcessInfo[]; pending: number } {
    const candidates = procs.filter((p) => isCleanupCandidate(p, mode));
    this.reconcile(procs, mode);
    const ready: GcProcessInfo[] = [];
    for (const p of candidates) {
      const key = processIdentity(p);
      const prior = this.seen.get(key);
      const observation =
        prior && now - prior.last <= maxGapMs && now >= prior.last
          ? { since: prior.since, last: now }
          : { since: now, last: now };
      this.seen.set(key, observation);
      if (this.isReady(p, now, graceSeconds, maxGapMs)) ready.push(p);
    }
    return { ready, pending: candidates.length - ready.length };
  }
}
