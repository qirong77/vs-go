import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore -- Node strip-types needs explicit .ts extensions.
import { GcScheduler } from "../windows/gc/scheduler.ts";

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function harness() {
  const settings = { autoClean: true, intervalMinutes: 30 };
  const timers = new Map<number, { callback: () => void; ms: number }>();
  const dates: Array<number | null> = [];
  let id = 0;
  let calls = 0;
  let result = { pendingCount: 0, error: undefined as string | undefined };
  const runs: Array<() => boolean> = [];
  let override: ((current: () => boolean) => Promise<typeof result>) | undefined;
  const scheduler = new GcScheduler({
    settings: () => settings,
    run: async (current) => {
      calls++;
      runs.push(current);
      return override ? override(current) : result;
    },
    changed: (at) => {
      dates.push(at);
    },
    now: () => 1000000,
    setTimer: (callback, ms) => {
      timers.set(++id, { callback, ms });
      return id;
    },
    clearTimer: (key) => {
      timers.delete(key as number);
    },
  });
  return {
    settings,
    timers,
    dates,
    scheduler,
    runs,
    calls: () => calls,
    result: (next: typeof result) => {
      result = next;
    },
    override: (run: NonNullable<typeof override>) => {
      override = run;
    },
    fire: async () => {
      assert.equal(timers.size, 1);
      const [key, timer] = [...timers][0];
      timers.delete(key);
      timer.callback();
      await settle();
    },
    delay: () => [...timers.values()][0]?.ms,
  };
}

test("restarting the runner cancels the previous startup timer", async () => {
  const h = harness();
  h.scheduler.start();
  h.scheduler.start();
  assert.equal(h.timers.size, 1);
  assert.equal(h.delay(), 15000);
  await h.fire();
  assert.equal(h.calls(), 1);
  assert.equal(h.delay(), 1800000);
});

test("stop also cancels the first run and clears the displayed deadline", () => {
  const h = harness();
  h.scheduler.start();
  h.scheduler.stop();
  assert.equal(h.timers.size, 0);
  assert.equal(h.dates.at(-1), null);
});

test("disabled automation creates no timer", () => {
  const h = harness();
  h.settings.autoClean = false;
  h.scheduler.start();
  assert.equal(h.timers.size, 0);
});

test("candidates shorten the recheck interval, then a quiet run restores normal cadence", async () => {
  const h = harness();
  h.result({ pendingCount: 2, error: undefined });
  h.scheduler.start();
  await h.fire();
  assert.equal(h.delay(), 30000);
  h.result({ pendingCount: 0, error: undefined });
  await h.fire();
  assert.equal(h.delay(), 1800000);
});

test("scan errors are retried with a bounded delay instead of a hot loop", async () => {
  const h = harness();
  h.result({ pendingCount: 0, error: "ps timeout" });
  h.scheduler.start();
  await h.fire();
  assert.equal(h.delay(), 300000);
});

test("an unexpected rejected task is caught and retried", async () => {
  const h = harness();
  h.override(async () => {
    throw new Error("failure");
  });
  h.scheduler.start();
  await h.fire();
  assert.equal(h.delay(), 300000);
});

test("stopping an in-flight run invalidates its permission to signal and prevents rescheduling", async () => {
  const h = harness();
  let complete!: (value: { pendingCount: number; error: undefined }) => void;
  h.override(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  );
  h.scheduler.start();
  await h.fire();
  assert.equal(h.runs[0](), true);
  h.scheduler.stop();
  assert.equal(h.runs[0](), false);
  complete({ pendingCount: 1, error: undefined });
  await settle();
  assert.equal(h.timers.size, 0);
  assert.equal(h.dates.at(-1), null);
});

test("a stale completion cannot replace the restarted scheduler's timer", async () => {
  const h = harness();
  let complete!: (value: { pendingCount: number; error: undefined }) => void;
  h.override(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  );
  h.scheduler.start();
  await h.fire();
  h.scheduler.start();
  assert.equal(h.runs[0](), false);
  complete({ pendingCount: 1, error: undefined });
  await settle();
  assert.equal(h.timers.size, 1);
  assert.equal(h.delay(), 15000);
});
