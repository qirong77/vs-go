import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore -- Node strip-types needs explicit .ts extensions.
import { terminateProcesses } from "../windows/gc/termination.ts";
import type { GcProcessInfo } from "../windows/gc/types";

const target: GcProcessInfo = {
  pid: 101,
  ppid: 1,
  uid: 501,
  state: "S",
  cpu: 0,
  rssMB: 100,
  path: "/Applications/Example.app/Helper",
  name: "Helper",
  startedAt: "Mon Sep 7 20:16:15 2026",
  elapsedSeconds: 600,
  tags: ["orphan-helper"],
};

function environment(snapshots: Array<GcProcessInfo[] | Error>) {
  const signals: Array<[number, string]> = [];
  const waits: number[] = [];
  let reads = 0;
  return {
    signals,
    waits,
    read: async () => {
      const value = snapshots[reads++];
      assert.ok(value, "Unexpected extra process scan");
      if (value instanceof Error) throw value;
      return value;
    },
    signal: (pid: number, signal: "SIGTERM" | "SIGKILL") => {
      signals.push([pid, signal]);
    },
    wait: async (ms: number) => {
      waits.push(ms);
    },
    allowed: (p: GcProcessInfo) =>
      p.tags.includes("orphan-helper") && !p.tags.includes("protected"),
  };
}

test("an empty candidate set never scans, signals, or waits", async () => {
  const env = environment([]);
  const result = await terminateProcesses([], env);
  assert.deepEqual(result, { killed: [], skipped: [] });
  assert.deepEqual(env.waits, []);
});

test("a reused PID before TERM is skipped even when its path is unchanged", async () => {
  const env = environment([[{ ...target, startedAt: "new start" }]]);
  const result = await terminateProcesses([target], env);
  assert.equal(result.skipped.length, 1);
  assert.deepEqual(env.signals, []);
  assert.deepEqual(env.waits, []);
});

test("graceful exit is recorded without KILL, and all targets share one grace period", async () => {
  const second = { ...target, pid: 102, rssMB: 50 };
  const env = environment([[target, second], []]);
  const result = await terminateProcesses([target, second], env);
  assert.deepEqual(env.signals, [
    [101, "SIGTERM"],
    [102, "SIGTERM"],
  ]);
  assert.deepEqual(env.waits, [2000]);
  assert.deepEqual(
    result.killed.map((p) => p.pid),
    [101, 102]
  );
});

test("PID reuse during grace period never sends KILL to the new process", async () => {
  const env = environment([[target], [{ ...target, startedAt: "new start" }]]);
  const result = await terminateProcesses([target], env);
  assert.deepEqual(env.signals, [[101, "SIGTERM"]]);
  assert.equal(result.killed.length, 1);
});

test("a changed executable or UID also prevents escalation", async () => {
  for (const changed of [
    { ...target, path: "/bin/other" },
    { ...target, uid: 502 },
  ]) {
    const env = environment([[target], [changed]]);
    await terminateProcesses([target], env);
    assert.deepEqual(env.signals, [[101, "SIGTERM"]]);
  }
});

test("new protection or an application restart prevents KILL", async () => {
  for (const changed of [
    { ...target, tags: ["protected"] as GcProcessInfo["tags"] },
    { ...target, tags: [] },
  ]) {
    const env = environment([[target], [changed]]);
    const result = await terminateProcesses([target], env);
    assert.deepEqual(env.signals, [[101, "SIGTERM"]]);
    assert.equal(result.killed.length, 0);
    assert.equal(result.skipped.length, 1);
  }
});

test("KILL is only sent to a revalidated survivor, followed by an exit check", async () => {
  const env = environment([[target], [target], []]);
  const result = await terminateProcesses([target], env);
  assert.deepEqual(env.signals, [
    [101, "SIGTERM"],
    [101, "SIGKILL"],
  ]);
  assert.deepEqual(env.waits, [2000, 300]);
  assert.equal(result.killed.length, 1);
});

test("a zombie after TERM is exited and must not receive further signals", async () => {
  const env = environment([[target], [{ ...target, state: "Z" }]]);
  const result = await terminateProcesses([target], env);
  assert.equal(result.killed.length, 1);
  assert.deepEqual(env.signals, [[101, "SIGTERM"]]);
});

test("permission errors are surfaced instead of reported as reclaimed memory", async () => {
  const env = environment([[target]]);
  env.signal = () => {
    throw Object.assign(new Error("denied"), { code: "EPERM" });
  };
  const result = await terminateProcesses([target], env);
  assert.equal(result.killed.length, 0);
  assert.match(result.skipped[0].reason, /EPERM/);
  assert.deepEqual(env.waits, []);
});

test("snapshot failure stops escalation and reports uncertainty", async () => {
  const env = environment([[target], new Error("ps failed")]);
  const result = await terminateProcesses([target], env);
  assert.deepEqual(env.signals, [[101, "SIGTERM"]]);
  assert.equal(result.error, "ps failed");
  assert.equal(result.killed.length, 0);
  assert.equal(result.skipped.length, 1);
});

test("a surviving process is not counted as terminated", async () => {
  const env = environment([[target], [target], [target]]);
  const result = await terminateProcesses([target], env);
  assert.equal(result.killed.length, 0);
  assert.match(result.skipped[0].reason, /尚未退出/);
});

test("cancelling automation while waiting prevents force termination", async () => {
  const env = environment([[target], [target]]);
  let enabled = true;
  env.allowed = () => enabled;
  env.wait = async () => {
    enabled = false;
  };
  const result = await terminateProcesses([target], env);
  assert.deepEqual(env.signals, [[101, "SIGTERM"]]);
  assert.equal(result.skipped.length, 1);
});
