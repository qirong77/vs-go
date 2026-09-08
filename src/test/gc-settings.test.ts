import assert from "node:assert/strict";
import test from "node:test";
import type { GcSettings } from "../windows/gc/types";
// @ts-ignore -- These tests run directly with Node's TypeScript support.
import { DEFAULT_GC_SETTINGS, normalizeGcSettings } from "../windows/gc/settings.ts";

const RANGES = [
  ["intervalMinutes", 5, 720],
  ["cpuHighThreshold", 10, 500],
  ["memHighThresholdMB", 50, 100000],
  ["orphanGraceSeconds", 30, 3600],
] as const;

test("empty settings use the documented defaults and return an independent protection array", () => {
  const expected: GcSettings = {
    autoClean: true,
    deepClean: true,
    orphanGraceSeconds: 60,
    intervalMinutes: 30,
    cpuHighThreshold: 80,
    memHighThresholdMB: 500,
    protected: [],
  };
  assert.deepEqual(DEFAULT_GC_SETTINGS, expected);
  const settings = normalizeGcSettings({});
  assert.deepEqual(settings, expected);
  assert.notEqual(settings, DEFAULT_GC_SETTINGS);
  assert.notEqual(settings.protected, DEFAULT_GC_SETTINGS.protected);
  settings.protected.push("local entry");
  assert.deepEqual(DEFAULT_GC_SETTINGS.protected, []);
  assert.deepEqual(normalizeGcSettings({}), expected);
});

test("patches merge with current settings without changing either input", () => {
  const current = normalizeGcSettings({
    autoClean: false,
    deepClean: false,
    intervalMinutes: 15,
    cpuHighThreshold: 120,
    memHighThresholdMB: 1024,
    orphanGraceSeconds: 90,
    protected: ["Keep App"],
  });
  const original = { ...current, protected: [...current.protected] };
  const patch = Object.freeze({ intervalMinutes: 45, autoClean: true });
  const result = normalizeGcSettings(patch, current);
  assert.deepEqual(result, { ...original, intervalMinutes: 45, autoClean: true });
  assert.deepEqual(current, original);
  assert.deepEqual(patch, { intervalMinutes: 45, autoClean: true });
  assert.notEqual(result.protected, current.protected);
  result.protected.push("Another App");
  assert.deepEqual(current.protected, ["Keep App"]);
});

test("numeric ranges accept inclusive endpoints and finite fractional values", () => {
  for (const [key, min, max] of RANGES) {
    for (const value of [min, max, min + 0.5]) {
      assert.equal(normalizeGcSettings({ [key]: value })[key], value, `${key}=${value}`);
    }
  }
});

test("numeric ranges reject values just outside each bound", () => {
  for (const [key, min, max] of RANGES) {
    for (const value of [min - 0.01, max + 0.01, -1]) {
      assert.throws(() => normalizeGcSettings({ [key]: value }), RangeError, `${key}=${value}`);
    }
  }
});

test("numeric fields reject non-finite numbers and types without coercion", () => {
  for (const [key] of RANGES) {
    for (const value of [
      NaN,
      Infinity,
      -Infinity,
      "60",
      "",
      true,
      false,
      null,
      undefined,
      [],
      {},
      60n,
    ]) {
      assert.throws(
        () => normalizeGcSettings({ [key]: value }),
        TypeError,
        `${key}: ${String(value)}`
      );
    }
  }
});

test("boolean fields accept only actual booleans, including false", () => {
  for (const key of ["autoClean", "deepClean"] as const) {
    for (const value of [false, true]) {
      assert.equal(normalizeGcSettings({ [key]: value })[key], value);
    }
    for (const value of [0, 1, "true", "false", null, undefined, [], {}]) {
      assert.throws(
        () => normalizeGcSettings({ [key]: value }),
        TypeError,
        `${key}: ${String(value)}`
      );
    }
  }
});

test("settings patches require plain or null-prototype objects", () => {
  class CustomPatch {
    autoClean = false;
  }
  for (const patch of [
    null,
    undefined,
    [],
    "",
    "{}",
    1,
    true,
    () => ({}),
    new Date(0),
    new Map(),
    new CustomPatch(),
    Object.create({ autoClean: false }),
  ]) {
    assert.throws(() => normalizeGcSettings(patch), TypeError);
  }
  const patch = Object.create(null);
  patch.autoClean = false;
  patch.protected = [" Keep App "];
  assert.deepEqual(normalizeGcSettings(patch), {
    ...DEFAULT_GC_SETTINGS,
    autoClean: false,
    protected: ["Keep App"],
  });
});

test("unknown fields reject even when symbol-keyed, nonenumerable or named like prototype fields", () => {
  const patches = [
    { unexpected: true },
    { intervalMinute: 30 },
    { constructor: "value" },
    { toString: "value" },
    { [Symbol("unknown")]: true },
    Object.defineProperty({}, "hidden", { value: 1, enumerable: false }),
    JSON.parse('{"__proto__":{"autoClean":false}}'),
  ];
  for (const patch of patches) assert.throws(() => normalizeGcSettings(patch), TypeError);
});

test("protected rules trim whitespace, remove empty values and deduplicate case-insensitively", () => {
  const input = [
    "  Example Helper  ",
    "example helper",
    "",
    " \t\n ",
    " /Applications/My App.app/Contents/ ",
    "/applications/my app.app/contents/",
    "  Different App ",
    "DIFFERENT APP",
  ];
  const original = [...input];
  const result = normalizeGcSettings({ protected: input });
  assert.deepEqual(result.protected, [
    "Example Helper",
    "/Applications/My App.app/Contents/",
    "Different App",
  ]);
  assert.deepEqual(input, original);
  assert.notEqual(result.protected, input);
  assert.deepEqual(normalizeGcSettings({ protected: [] }, result).protected, []);
});

test("protected requires an array of strings without coercion", () => {
  for (const value of [null, undefined, "App", {}, 1, true, new Set(["App"])]) {
    assert.throws(() => normalizeGcSettings({ protected: value }), TypeError);
  }
  for (const value of [null, undefined, 1, true, {}, [], new String("App")]) {
    assert.throws(() => normalizeGcSettings({ protected: ["Valid", value] }), TypeError);
  }
  assert.throws(() => normalizeGcSettings({ protected: new Array(1) }), TypeError);
});

test("protected character limit applies after trimming and includes the 500-character boundary", () => {
  const boundary = "x".repeat(500);
  assert.deepEqual(normalizeGcSettings({ protected: [`  ${boundary}  `] }).protected, [boundary]);
  assert.throws(() => normalizeGcSettings({ protected: ["x".repeat(501)] }), RangeError);
  assert.deepEqual(normalizeGcSettings({ protected: [" ".repeat(501)] }).protected, []);
});

test("protected permits 100 unique rules and checks count after normalization", () => {
  const rules = Array.from({ length: 100 }, (_, i) => `App ${i}`);
  assert.deepEqual(normalizeGcSettings({ protected: rules }).protected, rules);
  assert.throws(() => normalizeGcSettings({ protected: [...rules, "App 100"] }), RangeError);
  assert.deepEqual(
    normalizeGcSettings({
      protected: [...rules, ...rules.map((rule) => ` ${rule.toUpperCase()} `), "", " "],
    }).protected,
    rules
  );
});

test("invalid patches do not mutate the current settings", () => {
  const current = normalizeGcSettings({ autoClean: false, protected: ["Keep App"] });
  const original = { ...current, protected: [...current.protected] };
  for (const patch of [
    { autoClean: "false" },
    { intervalMinutes: Infinity },
    { protected: ["Valid", 1] },
    { unknown: 1 },
  ]) {
    assert.throws(() => normalizeGcSettings(patch));
    assert.deepEqual(current, original);
  }
});
