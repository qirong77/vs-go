import Store from "electron-store";
import type { GcSettings } from "./types";
import { DEFAULT_GC_SETTINGS, normalizeGcSettings } from "./settings";

export { DEFAULT_GC_SETTINGS, normalizeGcSettings } from "./settings";

const schema = {
  gcSettings: {
    type: "object",
    default: DEFAULT_GC_SETTINGS,
    properties: {
      autoClean: { type: "boolean" },
      deepClean: { type: "boolean" },
      orphanGraceSeconds: { type: "number" },
      intervalMinutes: { type: "number" },
      cpuHighThreshold: { type: "number" },
      memHighThresholdMB: { type: "number" },
      protected: { type: "array", items: { type: "string" } },
    },
  },
} as const;

const store = new Store({ schema });

export function getGcSettings(): GcSettings {
  const stored = store.get("gcSettings");
  return normalizeGcSettings(stored ?? {});
}

export function setGcSettings(patch: unknown): GcSettings {
  const next = normalizeGcSettings(patch, getGcSettings());
  store.set("gcSettings", next);
  return next;
}
