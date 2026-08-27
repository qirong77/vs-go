export type WaitMode = "all" | "any";

export interface WaitCondition {
  type: string;
  [key: string]: unknown;
}

export interface WaitActivity {
  pendingNetwork: number;
  lastNetworkActivity: number;
  lastRuntimeErrorAt: number | null;
}

export interface WaitEvent {
  seq: number;
  type: string;
  timestamp: string;
  payload: unknown;
}

export interface WaitContext {
  evaluate(expression: string): Promise<unknown>;
  getUrl(): string;
  getActivity(): WaitActivity;
  getEvents(after: number): WaitEvent[];
  getLatestSequence(): number;
  signal?: AbortSignal;
}

export interface WaitOptions {
  mode?: WaitMode;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface WaitObservation {
  index: number;
  type: string;
  matched: boolean;
  value?: unknown;
  error?: string;
  observedAt: string;
}

export interface WaitResult {
  matched: boolean;
  mode: WaitMode;
  waitedMs: number;
  observations: WaitObservation[];
}

interface StableSample {
  value: string;
  since: number;
}

function numberOption(condition: WaitCondition, key: string, fallback: number): number {
  const value = condition[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringOption(condition: WaitCondition, key: string, fallback = ""): string {
  return typeof condition[key] === "string" ? condition[key] : fallback;
}

function payloadMatches(payload: unknown, condition: WaitCondition): boolean {
  const serialized = JSON.stringify(payload ?? null);
  const contains = stringOption(condition, "contains");
  if (contains && !serialized.includes(contains)) return false;
  const status = condition.status;
  if (typeof status === "number") {
    const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const actual =
      typeof record.status === "number"
        ? record.status
        : typeof record.response === "object" && record.response !== null
          ? (record.response as Record<string, unknown>).status
          : undefined;
    if (actual !== status) return false;
  }
  return true;
}

function selectorExpression(condition: WaitCondition): string {
  const selector = stringOption(condition, "selector");
  const state = stringOption(condition, "state", "attached");
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (${JSON.stringify(state)} === 'detached') return { matched: !el, exists: !!el };
    if (!el) return { matched: false, exists: false };
    const style = getComputedStyle(el); const r = el.getBoundingClientRect();
    const visible = style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && r.width > 0 && r.height > 0;
    const disabled = !!el.disabled || el.getAttribute('aria-disabled') === 'true';
    const matched = ${JSON.stringify(state)} === 'visible' ? visible :
      ${JSON.stringify(state)} === 'hidden' ? !visible :
      ${JSON.stringify(state)} === 'enabled' ? !disabled :
      ${JSON.stringify(state)} === 'disabled' ? disabled : true;
    return { matched, exists: true, visible, disabled, text: String(el.innerText || el.textContent || '').trim().slice(0, 500) };
  })()`;
}

function textExpression(condition: WaitCondition): string {
  const selector = stringOption(condition, "selector", "body");
  const expected = stringOption(condition, "value");
  const match = stringOption(condition, "match", "contains");
  return `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return {matched:false, exists:false};
    const text = String(el.innerText || el.textContent || '').trim();
    return { matched: ${JSON.stringify(match)} === 'exact' ? text === ${JSON.stringify(expected)} : text.includes(${JSON.stringify(expected)}), exists:true, text:text.slice(0,500) }; })()`;
}

function domStableExpression(): string {
  return `(() => { const key = Symbol.for('vsgo.remote-browser.dom-stability'); let state = window[key];
    if (!state) { state = { lastMutation: Date.now() }; const observer = new MutationObserver(() => { state.lastMutation = Date.now(); });
      observer.observe(document, {subtree:true, childList:true, attributes:true, characterData:true});
      Object.defineProperty(window, key, {value:state, configurable:true}); }
    return { lastMutation: state.lastMutation, quietMs: Date.now() - state.lastMutation }; })()`;
}

function elementRectExpression(condition: WaitCondition): string {
  const selector = stringOption(condition, "selector");
  return `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
    const r = el.getBoundingClientRect(); return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)].join(','); })()`;
}

async function observeCondition(
  condition: WaitCondition,
  index: number,
  context: WaitContext,
  startedAt: number,
  eventCursor: number,
  stableSamples: Map<number, StableSample>
): Promise<WaitObservation> {
  const observedAt = new Date().toISOString();
  try {
    if (condition.type === "readyState" || condition.type === "lifecycle") {
      const expected = stringOption(condition, "state", condition.type === "lifecycle" ? "load" : "complete");
      const value = await context.evaluate("document.readyState");
      const rank: Record<string, number> = { loading: 0, interactive: 1, domcontentloaded: 1, complete: 2, load: 2 };
      return { index, type: condition.type, matched: (rank[String(value)] ?? -1) >= (rank[expected] ?? 2), value, observedAt };
    }
    if (condition.type === "selector") {
      const value = (await context.evaluate(selectorExpression(condition))) as Record<string, unknown>;
      return { index, type: condition.type, matched: value?.matched === true, value, observedAt };
    }
    if (condition.type === "text") {
      const value = (await context.evaluate(textExpression(condition))) as Record<string, unknown>;
      return { index, type: condition.type, matched: value?.matched === true, value, observedAt };
    }
    if (condition.type === "url") {
      const url = context.getUrl();
      const expected = stringOption(condition, "value");
      const match = stringOption(condition, "match", "contains");
      const matched = match === "exact" ? url === expected : match === "startsWith" ? url.startsWith(expected) : url.includes(expected);
      return { index, type: condition.type, matched, value: url, observedAt };
    }
    if (condition.type === "expression") {
      const value = await context.evaluate(stringOption(condition, "expression", "false"));
      return { index, type: condition.type, matched: Boolean(value), value, observedAt };
    }
    if (condition.type === "networkIdle") {
      const activity = context.getActivity();
      const idleMs = numberOption(condition, "idleMs", 500);
      const maxInflight = numberOption(condition, "maxInflight", 0);
      const quietMs = Date.now() - activity.lastNetworkActivity;
      return {
        index,
        type: condition.type,
        matched: activity.pendingNetwork <= maxInflight && quietMs >= idleMs,
        value: { ...activity, quietMs, idleMs, maxInflight },
        observedAt,
      };
    }
    if (condition.type === "runtimeQuiet") {
      const activity = context.getActivity();
      const durationMs = numberOption(condition, "durationMs", 500);
      const quietMs = activity.lastRuntimeErrorAt === null ? Date.now() - startedAt : Date.now() - activity.lastRuntimeErrorAt;
      return { index, type: condition.type, matched: quietMs >= durationMs, value: { quietMs, durationMs }, observedAt };
    }
    if (condition.type === "domStable") {
      const value = (await context.evaluate(domStableExpression())) as { quietMs?: number };
      const durationMs = numberOption(condition, "durationMs", 500);
      return { index, type: condition.type, matched: Number(value?.quietMs) >= durationMs, value: { ...value, durationMs }, observedAt };
    }
    if (condition.type === "elementStable") {
      const value = String((await context.evaluate(elementRectExpression(condition))) ?? "");
      const durationMs = numberOption(condition, "durationMs", 300);
      const previous = stableSamples.get(index);
      if (!value) {
        stableSamples.delete(index);
        return { index, type: condition.type, matched: false, value: null, observedAt };
      }
      if (!previous || previous.value !== value) stableSamples.set(index, { value, since: Date.now() });
      const sample = stableSamples.get(index)!;
      return { index, type: condition.type, matched: Date.now() - sample.since >= durationMs, value: { rect: value, stableMs: Date.now() - sample.since }, observedAt };
    }
    if (["event", "console", "runtimeException", "request", "response"].includes(condition.type)) {
      const aliases: Record<string, string[]> = {
        console: ["console", "console.message", "runtime.console"],
        runtimeException: ["runtime.exception"],
        request: ["network.request"],
        response: ["network.response"],
      };
      const wanted = condition.type === "event" ? [stringOption(condition, "eventType")] : aliases[condition.type] ?? [];
      const found = context
        .getEvents(eventCursor)
        .find((event) => wanted.some((type) => event.type === type || event.type.startsWith(`${type}.`)) && payloadMatches(event.payload, condition));
      return { index, type: condition.type, matched: Boolean(found), value: found ?? null, observedAt };
    }
    return { index, type: condition.type, matched: false, error: `unsupported condition type: ${condition.type}`, observedAt };
  } catch (error) {
    return {
      index,
      type: condition.type,
      matched: false,
      error: error instanceof Error ? error.message : String(error),
      observedAt,
    };
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("aborted"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error("aborted"));
      },
      { once: true }
    );
  });
}

export async function waitForConditions(
  context: WaitContext,
  conditions: WaitCondition[],
  options: WaitOptions = {}
): Promise<WaitResult> {
  if (conditions.length === 0) throw new Error("at least one wait condition is required");
  const mode = options.mode ?? "all";
  const timeoutMs = options.timeoutMs ?? 5_000;
  const pollIntervalMs = options.pollIntervalMs ?? 100;
  const startedAt = Date.now();
  const eventCursor = context.getLatestSequence();
  const stableSamples = new Map<number, StableSample>();
  let observations: WaitObservation[] = [];

  for (;;) {
    if (context.signal?.aborted) throw context.signal.reason ?? new Error("aborted");
    observations = await Promise.all(
      conditions.map((condition, index) =>
        observeCondition(condition, index, context, startedAt, eventCursor, stableSamples)
      )
    );
    const matched = mode === "all" ? observations.every((item) => item.matched) : observations.some((item) => item.matched);
    if (matched) return { matched: true, mode, waitedMs: Date.now() - startedAt, observations };
    if (Date.now() - startedAt >= timeoutMs) {
      return { matched: false, mode, waitedMs: Date.now() - startedAt, observations };
    }
    await delay(Math.min(pollIntervalMs, Math.max(1, timeoutMs - (Date.now() - startedAt))), context.signal);
  }
}
