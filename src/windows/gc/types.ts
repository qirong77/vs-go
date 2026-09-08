// ============================================================
// 系统 GC 模块 - 跨进程类型（main / renderer 共享）
// ============================================================

export type GcProcessTag =
  | "high-cpu"
  | "high-mem"
  | "orphan-helper"
  | "orphan-descendant"
  | "zombie"
  | "protected"
  | "system";

export interface GcProcessInfo {
  pid: number;
  ppid: number;
  uid: number;
  state: string;
  /** CPU 百分比（多核可超过 100，ps 的衰减平均值） */
  cpu: number;
  /** 常驻内存 MB */
  rssMB: number;
  name: string;
  /** ps comm 返回的可执行路径，保留空格 */
  path: string;
  /** ps lstart，参与 PID 身份复核 */
  startedAt: string;
  elapsedSeconds: number;
  cleanupReason?: string;
  tags: GcProcessTag[];
}

export interface GcMemoryInfo {
  totalMB: number;
  freeMB: number;
  usedMB: number;
  usedPercent: number;
}

export interface GcSettings {
  /** 是否开启后台自动清理 */
  autoClean: boolean;
  /** 自动清理是否包含同应用的残留 helper 子树 */
  deepClean: boolean;
  /** 自动清理前持续观察孤儿的时间 */
  orphanGraceSeconds: number;
  /** 自动清理间隔（分钟） */
  intervalMinutes: number;
  /** 高 CPU 判定阈值（%） */
  cpuHighThreshold: number;
  /** 高内存判定阈值（MB） */
  memHighThresholdMB: number;
  /** 保护名单：进程路径片段或名称，命中则不清理 */
  protected: string[];
}

export type GcLogAction = "clean" | "kill" | "settings" | "protect";

export interface GcLogEntry {
  /** epoch ms */
  time: number;
  source: "auto" | "manual";
  action: GcLogAction;
  message: string;
  killed: Array<{ pid: number; name: string; rssMB: number }>;
  freedMB: number;
  skipped: Array<{ pid: number; name: string; reason: string }>;
  detail?: string;
}

export interface GcKilledItem {
  pid: number;
  name: string;
  path: string;
  rssMB: number;
}

export interface GcSkippedItem {
  pid: number;
  name: string;
  reason: string;
}

export interface GcCleanResult {
  at: number;
  source: "auto" | "manual";
  killed: GcKilledItem[];
  skipped: GcSkippedItem[];
  freedMB: number;
  mode: "standard" | "deep";
  /** 尚在观察期的候选数，用于加快后续复查 */
  pendingCount: number;
  error?: string;
}

export interface GcSnapshot {
  bootAt: number;
  memory: GcMemoryInfo;
  settings: GcSettings;
  processes: GcProcessInfo[];
  lastCleanAt: number | null;
  lastCleanResult: GcCleanResult | null;
  logEntries: GcLogEntry[];
  running: boolean;
  nextRunAt: number | null;
}
