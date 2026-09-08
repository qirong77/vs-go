import type { GcSettings } from "./types";

export const DEFAULT_GC_SETTINGS: GcSettings = {
  autoClean: true,
  deepClean: true,
  orphanGraceSeconds: 60,
  intervalMinutes: 30,
  cpuHighThreshold: 80,
  memHighThresholdMB: 500,
  protected: [],
};

const NUMERIC_RANGES = {
  intervalMinutes: [5, 720],
  cpuHighThreshold: [10, 500],
  memHighThresholdMB: [50, 100000],
  orphanGraceSeconds: [30, 3600],
} as const;

/** Validate an IPC patch without coercion, then merge with the current settings. */
export function normalizeGcSettings(patch: unknown, current?: GcSettings): GcSettings {
  if (
    patch === null ||
    typeof patch !== "object" ||
    Array.isArray(patch) ||
    (Object.getPrototypeOf(patch) !== Object.prototype && Object.getPrototypeOf(patch) !== null)
  ) {
    throw new TypeError("GC 设置必须为对象");
  }
  for (const key of Reflect.ownKeys(patch)) {
    if (typeof key !== "string" || !Object.hasOwn(DEFAULT_GC_SETTINGS, key)) {
      throw new TypeError(`未知的 GC 设置字段：${String(key)}`);
    }
  }

  const next = { ...DEFAULT_GC_SETTINGS, ...current, ...patch } as GcSettings;
  for (const key of ["autoClean", "deepClean"] as const) {
    if (typeof next[key] !== "boolean") {
      throw new TypeError(`${key} 必须为布尔值`);
    }
  }
  for (const key of Object.keys(NUMERIC_RANGES) as Array<keyof typeof NUMERIC_RANGES>) {
    const value = next[key];
    const [min, max] = NUMERIC_RANGES[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`${key} 必须为有限数值`);
    }
    if (value < min || value > max) {
      throw new RangeError(`${key} 必须在 ${min} 到 ${max} 之间`);
    }
  }
  if (!Array.isArray(next.protected)) {
    throw new TypeError("保护名单必须为字符串数组");
  }
  const seen = new Set<string>();
  const protectedNames: string[] = [];
  for (const item of next.protected) {
    if (typeof item !== "string") throw new TypeError("保护名单每一项必须为字符串");
    const value = item.trim();
    if (value.length > 500) throw new RangeError("保护名单每项最多 500 个字符");
    const key = value.toLowerCase();
    if (value && !seen.has(key)) {
      seen.add(key);
      protectedNames.push(value);
    }
  }
  if (protectedNames.length > 100) throw new RangeError("保护名单最多 100 项");
  return { ...next, protected: protectedNames };
}
