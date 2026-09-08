export interface SchedulerDependencies {
  settings: () => { autoClean: boolean; intervalMinutes: number };
  run: (isCurrent: () => boolean) => Promise<{ pendingCount: number; error?: string }>;
  changed: (nextAt: number | null) => void;
  now: () => number;
  setTimer: (callback: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
}

/** One cancellable timer, including the initial delay. Stale completions cannot reschedule it. */
export class GcScheduler {
  private dependencies: SchedulerDependencies;
  private timer: unknown = null;
  private generation = 0;

  constructor(dependencies: SchedulerDependencies) {
    this.dependencies = dependencies;
  }

  start(): void {
    this.stop();
    if (this.dependencies.settings().autoClean) this.schedule(15000, this.generation);
  }

  stop(): void {
    this.generation++;
    if (this.timer !== null) this.dependencies.clearTimer(this.timer);
    this.timer = null;
    this.dependencies.changed(null);
  }

  private schedule(ms: number, generation: number): void {
    this.dependencies.changed(this.dependencies.now() + ms);
    this.timer = this.dependencies.setTimer(() => {
      this.timer = null;
      this.dependencies.changed(null);
      void this.tick(generation);
    }, ms);
  }

  private async tick(generation: number): Promise<void> {
    const isCurrent = (): boolean =>
      generation === this.generation && this.dependencies.settings().autoClean;
    if (!isCurrent()) return;
    let result: { pendingCount: number; error?: string };
    try {
      result = await this.dependencies.run(isCurrent);
    } catch {
      result = { pendingCount: 0, error: "自动清理失败" };
    }
    if (!isCurrent()) return;
    const normalMs = this.dependencies.settings().intervalMinutes * 60000;
    const delay = result.error
      ? Math.min(normalMs, 300000)
      : result.pendingCount > 0
        ? 30000
        : normalMs;
    this.schedule(delay, generation);
  }
}
