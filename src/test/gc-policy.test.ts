import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyProcesses,
  isCleanupCandidate,
  matchesProtection,
  OrphanObservations,
  parseElapsed,
  parseProcessTable,
  processIdentity,
  // @ts-ignore -- These tests run directly with Node's TypeScript support.
} from "../windows/gc/process-policy.ts";
// @ts-ignore -- Explicit .ts imports allow direct Node execution.
import { DEFAULT_GC_SETTINGS } from "../windows/gc/settings.ts";
// @ts-ignore -- Explicit .ts imports allow direct Node execution.
import type { GcProcessInfo, GcSettings } from "../windows/gc/types.ts";

// Only fixture process tables and timestamps are used; no process inspection or signals.
const UID = 501;
const SELF = 9000;
const START = "Mon Jun 10 12:34:56 2024";
const APP = "/Applications/Example App.app";
const helperPath = (bundle = APP, name = "Example App Helper") =>
  `${bundle}/Contents/Frameworks/${name}.app/Contents/MacOS/${name}`;

function proc(pid: number, patch: Partial<GcProcessInfo> = {}): GcProcessInfo {
  const executable = patch.path ?? helperPath();
  return {
    pid,
    ppid: 1,
    uid: UID,
    state: "S",
    cpu: 0,
    rssMB: 10,
    path: executable,
    name: executable.slice(executable.lastIndexOf("/") + 1),
    startedAt: START,
    elapsedSeconds: 600,
    tags: [],
    ...patch,
  };
}

function classify(rows: GcProcessInfo[], patch: Partial<GcSettings> = {}, uid = UID) {
  return classifyProcesses(rows, { ...DEFAULT_GC_SETTINGS, ...patch }, SELF, uid);
}

function candidates(rows: GcProcessInfo[], mode: "standard" | "deep" = "deep") {
  return rows
    .filter((p) => isCleanupCandidate(p, mode))
    .map((p) => p.pid)
    .sort((a, b) => a - b);
}

function psLine(
  patch: { pid?: number; cpu?: string; elapsed?: string; path?: string; start?: string } = {}
) {
  return `   ${patch.pid ?? 101}   1  501 S ${patch.cpu ?? "125.5"} 2048 ${patch.elapsed ?? "1-02:03:04"} ${patch.start ?? "Mon Jun  10 12:34:56 2024"} ${patch.path ?? helperPath()}`;
}

test("headerless ps retains the first row, leading whitespace, full comm and normalized lstart", () => {
  const rows = parseProcessTable(`\n${psLine()}\n\t${psLine({ pid: 102, elapsed: "03:04" })}\n\n`);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    pid: 101,
    ppid: 1,
    uid: UID,
    state: "S",
    cpu: 125.5,
    rssMB: 2,
    elapsedSeconds: 93784,
    startedAt: START,
    path: helperPath(),
    name: "Example App Helper",
    tags: [],
  });
  assert.equal(rows[1].pid, 102);
  assert.equal(rows[1].elapsedSeconds, 184);
  assert.equal(parseProcessTable(psLine().trimStart())[0].path, helperPath());
});

test("elapsed accepts minute, hour and day formats including zero", () => {
  for (const [input, expected] of [
    ["00:00", 0],
    ["59:59", 3599],
    ["120:00", 7200],
    ["02:03:04", 7384],
    ["1-02:03:04", 93784],
  ] as const) {
    assert.equal(parseElapsed(input), expected, input);
  }
});

test("malformed or partial snapshots reject the entire table", () => {
  const invalid = [
    "",
    " \n\t",
    "PID PPID UID STAT %CPU RSS ELAPSED STARTED COMM",
    "101 1 501 S 0 2048 00:10",
    `${psLine()}\ntruncated row`,
    psLine({ start: "not a start time" }),
    psLine({ path: " " }),
  ];
  for (const output of invalid) assert.throws(() => parseProcessTable(output), Error, output);
});

test("invalid CPU numbers and out-of-range elapsed fields reject snapshots", () => {
  for (const cpu of [".", "1.2.3", "NaN", "Infinity", "-1", "9".repeat(400)]) {
    assert.throws(
      () => parseProcessTable(`${psLine({ pid: 102 })}\n${psLine({ cpu })}`),
      Error,
      cpu
    );
  }
  for (const elapsed of ["00:60", "01:60:00", "1-02:03:60", "abc", "12", "1:2:3:4"]) {
    assert.throws(() => parseElapsed(elapsed), Error, elapsed);
    assert.throws(() => parseProcessTable(psLine({ elapsed })), Error, elapsed);
  }
});

test("duplicate PIDs reject the snapshot even when the rows differ", () => {
  assert.throws(() => parseProcessTable(`${psLine()}\n${psLine()}`));
  assert.throws(() => parseProcessTable(`${psLine()}\n${psLine({ path: "/usr/local/bin/node" })}`));
});

test("a running or zombie main application prevents orphan classification", () => {
  for (const state of ["S", "Z"]) {
    const rows = classify([
      proc(101),
      proc(102, { ppid: 101 }),
      proc(200, { path: `${APP}/Contents/MacOS/Example App`, state }),
    ]);
    assert.deepEqual(candidates(rows), [], state);
    assert.ok(!rows[0].tags.includes("orphan-helper"));
  }
});

test("a missing parent other than launchd does not establish an orphan", () => {
  for (const ppid of [0, 777]) {
    const rows = classify([proc(101, { ppid }), proc(102, { ppid: 101 })]);
    assert.deepEqual(candidates(rows), [], `ppid=${ppid}`);
  }
});

test("deep mode follows multiple helper levels within the same bundle only", () => {
  const rows = classify([
    proc(103, { ppid: 102 }),
    proc(102, { ppid: 101 }),
    proc(101),
    proc(104, { ppid: 103 }),
    proc(201, { ppid: 101, path: helperPath("/Applications/Other App.app") }),
    proc(202, { ppid: 101, path: "/usr/local/bin/node" }),
    proc(203, { ppid: 101, path: helperPath(APP, "Example Helper crashpad") }),
    proc(204, { ppid: 101, path: helperPath(APP, "Example Helper CrashReport") }),
    proc(205, { ppid: 101, path: helperPath(APP, "Example Helper Updater") }),
    proc(206, { ppid: 101, path: helperPath(APP, "Example Worker") }),
    // Matching descendants cannot jump across non-helper or other-application nodes.
    proc(207, { ppid: 202 }),
    proc(208, { ppid: 201 }),
    proc(209, { ppid: 203 }),
  ]);
  assert.deepEqual(candidates(rows, "standard"), [101]);
  assert.deepEqual(candidates(rows, "deep"), [101, 102, 103, 104]);
  for (const pid of [102, 103, 104]) {
    assert.ok(rows.find((p) => p.pid === pid)!.tags.includes("orphan-descendant"));
  }
});

test("standalone node, crashpad, updater and arbitrary framework executables are not candidates", () => {
  const rows = classify([
    proc(101, { path: "/usr/local/bin/node" }),
    proc(102, { path: helperPath(APP, "Example Helper crashpad") }),
    proc(103, { path: helperPath(APP, "Example Helper Updater") }),
    proc(104, { path: helperPath(APP, "Example Worker") }),
    proc(105, { path: `${APP}/Contents/Frameworks/Example Helper` }),
  ]);
  assert.deepEqual(candidates(rows), []);
});

test("root, another UID, unknown process UID, system paths, PID 1 and zombies are excluded", () => {
  const excluded = [
    proc(101, { uid: 0 }),
    proc(102, { uid: 502 }),
    proc(103, { uid: -1 }),
    proc(104, { path: helperPath("/System/Applications/System App.app") }),
    proc(105, { path: helperPath("/usr/libexec/System App.app") }),
    proc(106, { path: helperPath("/usr/sbin/System App.app") }),
    proc(107, { path: helperPath("/sbin/System App.app") }),
    proc(1),
    proc(108, { state: "Z+" }),
  ];
  const rows = classify([...excluded, proc(200)]);
  assert.deepEqual(candidates(rows), [200]);
  for (const p of excluded)
    assert.ok(p.tags.some((tag) => ["protected", "system", "zombie"].includes(tag)));
});

test("unknown current UID protects every process", () => {
  const rows = classify([proc(101), proc(102, { uid: 0 })], {}, -1);
  assert.deepEqual(candidates(rows), []);
  assert.ok(rows.every((p) => p.tags.includes("protected")));
});

test("self, descendants and ancestors are protected without protecting ancestors' other children", () => {
  const rows = classify([
    proc(SELF, { ppid: 8000, path: "/usr/local/bin/vsgo" }),
    proc(8000, { ppid: 7000, path: "/bin/zsh" }),
    proc(7000, { path: "/usr/bin/launcher" }),
    proc(101, { ppid: SELF }),
    proc(102, { ppid: 101 }),
    proc(103, { ppid: 8000, path: "/usr/local/bin/other" }),
    proc(200),
  ]);
  for (const pid of [SELF, 8000, 7000, 101, 102]) {
    assert.ok(rows.find((p) => p.pid === pid)!.tags.includes("protected"), String(pid));
  }
  assert.ok(!rows.find((p) => p.pid === 103)!.tags.includes("protected"));
  assert.deepEqual(candidates(rows), [200]);
});

test("self bundle protects detached helpers and their descendants", () => {
  const own = "/Applications/VsGo.app";
  const rows = classify([
    proc(SELF, { path: helperPath(own) }),
    proc(101, { path: helperPath(own, "VsGo Helper Renderer") }),
    proc(102, { ppid: 101 }),
    proc(200),
  ]);
  assert.deepEqual(candidates(rows), [200]);
  assert.ok(rows.filter((p) => p.pid !== 200).every((p) => p.tags.includes("protected")));
});

test("protection matches names and path fragments case-insensitively and ignores empty rules", () => {
  const p = proc(101);
  assert.equal(matchesProtection(p, ["  EXAMPLE APP HELPER  "]), true);
  assert.equal(matchesProtection(p, [" /APPLICATIONS/EXAMPLE APP.APP/CONTENTS/FRAME "]), true);
  assert.equal(matchesProtection(p, ["", "  ", "unrelated"]), false);
  assert.deepEqual(candidates(classify([p], { protected: ["example app.app/CONTENTS"] })), []);
});

test("a protected helper blocks its whole subtree while another branch remains eligible", () => {
  const rows = classify(
    [
      proc(101),
      proc(102, { ppid: 101, path: helperPath(APP, "Keep Me Helper") }),
      proc(103, { ppid: 102 }),
      proc(104, { ppid: 103 }),
      proc(105, { ppid: 101 }),
    ],
    { protected: [" KEEP ME "] }
  );
  assert.deepEqual(candidates(rows), [101, 105]);
  for (const pid of [102, 103, 104]) {
    const p = rows.find((p) => p.pid === pid)!;
    assert.ok(p.tags.includes("protected"));
    assert.ok(!p.tags.includes("orphan-descendant"));
  }
});

test("a system, foreign-user or zombie intermediate helper blocks traversal", () => {
  for (const patch of [{ uid: 0 }, { uid: 502 }, { state: "Z" }]) {
    const rows = classify([
      proc(101),
      proc(102, { ppid: 101, ...patch }),
      proc(103, { ppid: 102 }),
    ]);
    assert.deepEqual(candidates(rows), [101]);
  }
});

test("high CPU and memory are informational and do not make automatic candidates", () => {
  const rows = classify([
    proc(101, { ppid: 444, cpu: 500, rssMB: 10000 }),
    proc(102, { path: "/usr/local/bin/node", cpu: 500, rssMB: 10000 }),
  ]);
  assert.deepEqual(candidates(rows), []);
  for (const p of rows) {
    assert.ok(p.tags.includes("high-cpu"));
    assert.ok(p.tags.includes("high-mem"));
  }
  assert.deepEqual(new OrphanObservations().select(rows, "deep", 0, 60, 90000), {
    ready: [],
    pending: 0,
  });
});

test("reclassification removes stale orphan tags after the main app returns", () => {
  const orphan = proc(101);
  classify([orphan]);
  assert.ok(isCleanupCandidate(orphan, "deep"));
  classify([orphan, proc(200, { path: `${APP}/Contents/MacOS/Example App` })]);
  assert.equal(isCleanupCandidate(orphan, "deep"), false);
  assert.equal(orphan.cleanupReason, undefined);
});

const observed = (pid = 101, patch: Partial<GcProcessInfo> = {}) =>
  proc(pid, { tags: ["orphan-helper"], ...patch });
function observe(
  history: OrphanObservations,
  rows: GcProcessInfo[],
  now: number,
  mode: "standard" | "deep" = "deep"
) {
  const result = history.select(rows, mode, now, 60, 90000);
  return { ready: result.ready.map((p) => p.pid), pending: result.pending };
}

test("an orphan needs 60 seconds of continuous observations, regardless of existing age", () => {
  const history = new OrphanObservations();
  const p = observed();
  for (const time of [0, 30000, 59999]) {
    assert.deepEqual(observe(history, [p], time), { ready: [], pending: 1 });
  }
  assert.deepEqual(observe(history, [p], 60000), { ready: [101], pending: 0 });
});

test("process elapsed age must also reach the grace period", () => {
  const history = new OrphanObservations();
  observe(history, [observed(101, { elapsedSeconds: 0 })], 0);
  assert.deepEqual(observe(history, [observed(101, { elapsedSeconds: 59 })], 60000), {
    ready: [],
    pending: 1,
  });
  assert.deepEqual(observe(history, [observed(101, { elapsedSeconds: 60 })], 61000), {
    ready: [101],
    pending: 0,
  });
});

test("absence or loss of eligibility interrupts the observation period", () => {
  for (const interruption of [
    [],
    [proc(101)],
    [observed(101, { tags: ["orphan-helper", "protected"] })],
  ]) {
    const history = new OrphanObservations();
    observe(history, [observed()], 0);
    assert.deepEqual(observe(history, interruption, 30000), { ready: [], pending: 0 });
    assert.deepEqual(observe(history, [observed()], 60000), { ready: [], pending: 1 });
    assert.deepEqual(observe(history, [observed()], 120000), { ready: [101], pending: 0 });
  }
});

test("PID, start time, UID or executable identity changes restart observation", () => {
  const original = observed();
  for (const patch of [
    { pid: 102 },
    { startedAt: "Mon Jun 10 12:35:56 2024" },
    { uid: 502 },
    { path: helperPath(APP, "Changed Helper") },
  ]) {
    const history = new OrphanObservations();
    const changed = observed(101, patch);
    assert.notEqual(processIdentity(original), processIdentity(changed));
    observe(history, [original], 0);
    observe(history, [original], 30000);
    assert.deepEqual(observe(history, [changed], 60000), { ready: [], pending: 1 });
    assert.deepEqual(observe(history, [changed], 120000), { ready: [changed.pid], pending: 0 });
  }
  assert.equal(
    processIdentity(original),
    processIdentity(observed(101, { cpu: 99, elapsedSeconds: 900 }))
  );
});

test("sleep gaps above 90 seconds reset observation; an exact 90-second gap is allowed", () => {
  const history = new OrphanObservations();
  observe(history, [observed()], 0);
  observe(history, [observed()], 30000);
  assert.deepEqual(observe(history, [observed()], 120001), { ready: [], pending: 1 });
  assert.deepEqual(observe(history, [observed()], 180001), { ready: [101], pending: 0 });
  const boundary = new OrphanObservations();
  observe(boundary, [observed()], 0);
  assert.deepEqual(observe(boundary, [observed()], 90000), { ready: [101], pending: 0 });
});

test("a backward clock and explicit clear reset observation", () => {
  const history = new OrphanObservations();
  observe(history, [observed()], 100000);
  assert.deepEqual(observe(history, [observed()], 90000), { ready: [], pending: 1 });
  assert.deepEqual(observe(history, [observed()], 150000), { ready: [101], pending: 0 });
  history.clear();
  assert.deepEqual(observe(history, [observed()], 150001), { ready: [], pending: 1 });
});

test("standard mode filters descendants and switching modes resets their excluded observations", () => {
  const history = new OrphanObservations();
  const rows = [observed(), observed(102, { tags: ["orphan-descendant"], ppid: 101 })];
  assert.deepEqual(observe(history, rows, 0, "deep"), { ready: [], pending: 2 });
  assert.deepEqual(observe(history, rows, 30000, "standard"), { ready: [], pending: 1 });
  assert.deepEqual(observe(history, rows, 60000, "deep"), { ready: [101], pending: 1 });
  assert.deepEqual(observe(history, rows, 120000, "deep"), { ready: [101, 102], pending: 0 });
});

test("a revalidation snapshot interrupts observation before the next scheduled scan", () => {
  const history = new OrphanObservations();
  const p = observed();
  observe(history, [p], 0);
  observe(history, [p], 30000);
  assert.deepEqual(observe(history, [p], 60000), { ready: [101], pending: 0 });
  // The application's return is discovered during the pre-signal scan, not a scheduled scan.
  history.reconcile([proc(101)], "deep");
  assert.equal(history.isReady(p, 61000, 60, 90000), false);
  assert.deepEqual(observe(history, [p], 90000), { ready: [], pending: 1 });
  assert.deepEqual(observe(history, [p], 150000), { ready: [101], pending: 0 });
});

test("UI/revalidation snapshots cannot create observations or keep stale ones alive", () => {
  const history = new OrphanObservations();
  const p = observed();
  history.reconcile([p], "deep");
  assert.equal(history.isReady(p, 60000, 60, 90000), false);
  observe(history, [p], 0);
  history.reconcile([p], "deep");
  assert.equal(history.isReady(p, 90001, 60, 90000), false);
  assert.deepEqual(observe(history, [p], 90001), { ready: [], pending: 1 });
});

test("protected, system and zombie tags override orphan tags in both modes", () => {
  for (const tag of ["protected", "system", "zombie"] as const) {
    const p = observed(101, { tags: ["orphan-helper", "orphan-descendant", tag] });
    for (const mode of ["standard", "deep"] as const) {
      assert.equal(isCleanupCandidate(p, mode), false);
      assert.deepEqual(observe(new OrphanObservations(), [p], 0, mode), { ready: [], pending: 0 });
    }
  }
});
