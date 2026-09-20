import assert from "node:assert/strict";
import test from "node:test";
import {
  RemoteWindowReaper,
  sweepIdleRemoteWindows,
  type RemoteWindowState,
  // @ts-ignore -- Node 22 strip-types requires the explicit .ts extension at runtime.
} from "../windows/browser/electron/remote-browser-window-reaper.ts";

const TTL = 30 * 60 * 1000;
const NOW = 1_800_000_000_000;

function state(overrides: Partial<RemoteWindowState> = {}): RemoteWindowState {
  return {
    clientId: "default",
    windowId: 1,
    lastUsedAt: NOW - TTL,
    visible: false,
    hasActiveSession: false,
    ...overrides,
  };
}

test("windows still within the idle window are left untouched", () => {
  const result = sweepIdleRemoteWindows([state({ lastUsedAt: NOW - TTL + 1 })], NOW, TTL);
  assert.deepEqual(result, { recycled: [], skipped: [] });
});

test("a hidden window idle for exactly the ttl is recycled with its idle duration", () => {
  const result = sweepIdleRemoteWindows([state({ clientId: "coder", windowId: 7 })], NOW, TTL);
  assert.equal(result.recycled.length, 1);
  assert.equal(result.recycled[0].clientId, "coder");
  assert.equal(result.recycled[0].windowId, 7);
  assert.equal(result.recycled[0].idleMs, TTL);
  assert.deepEqual(result.skipped, []);
});

test("visible windows and windows with running sessions are reported but protected", () => {
  const result = sweepIdleRemoteWindows(
    [
      state({ clientId: "watching", visible: true }),
      state({ clientId: "recording", hasActiveSession: true }),
      state({ clientId: "idle" }),
    ],
    NOW,
    TTL
  );
  assert.deepEqual(
    result.recycled.map((w) => w.clientId),
    ["idle"]
  );
  assert.deepEqual(
    result.skipped.map((w) => ({ clientId: w.clientId, reason: w.reason })),
    [
      { clientId: "watching", reason: "visible" },
      { clientId: "recording", reason: "active-session" },
    ]
  );
});

test("a disabled ttl never recycles anything", () => {
  assert.deepEqual(sweepIdleRemoteWindows([state()], NOW, 0), { recycled: [], skipped: [] });
});

test("a clock skew that moves backwards does not produce negative idle time", () => {
  const result = sweepIdleRemoteWindows([state({ lastUsedAt: NOW + 60_000 })], NOW, TTL);
  assert.deepEqual(result, { recycled: [], skipped: [] });
});

function harness(states: RemoteWindowState[], idleTtlMs = TTL) {
  const timers = new Map<number, { callback: () => void; ms: number }>();
  const recycled: string[] = [];
  let id = 0;
  let clock = NOW;
  const reaper = new RemoteWindowReaper({
    idleTtlMs,
    sweepIntervalMs: 60_000,
    now: () => clock,
    setTimer: (callback, ms) => {
      timers.set(++id, { callback, ms });
      return id;
    },
    clearTimer: (key) => {
      timers.delete(key as number);
    },
    inspect: () => states,
    recycle: (window) => recycled.push(window.clientId),
  });
  return {
    reaper,
    timers,
    recycled,
    setClock: (next: number) => {
      clock = next;
    },
    delay: () => [...timers.values()][0]?.ms,
    fire: () => {
      const [key, timer] = [...timers][0];
      timers.delete(key);
      timer.callback();
    },
  };
}

test("the reaper sweeps on its interval and reschedules itself", () => {
  const h = harness([state({ clientId: "stale", lastUsedAt: NOW - TTL - 1 })]);
  h.reaper.start();
  assert.equal(h.reaper.running, true);
  assert.equal(h.timers.size, 1);
  assert.equal(h.delay(), 60_000);

  h.fire();
  assert.deepEqual(h.recycled, ["stale"]);
  assert.equal(h.timers.size, 1, "the sweep keeps running for the next round");
});

test("starting a running reaper does not stack timers, and stop clears them", () => {
  const h = harness([state()]);
  h.reaper.start();
  h.reaper.start();
  assert.equal(h.timers.size, 1);
  h.reaper.stop();
  assert.equal(h.timers.size, 0);
  assert.equal(h.reaper.running, false);
});

test("a disabled reaper never schedules a timer", () => {
  const h = harness([state()], 0);
  h.reaper.start();
  assert.equal(h.reaper.running, false);
  assert.equal(h.timers.size, 0);
});
