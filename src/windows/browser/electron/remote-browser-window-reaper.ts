// ============================================================
// Remote Window Reaper
// 「远程浏览器控制」空闲窗口回收策略。
// 远程控制窗口按 clientId 各持一个，LLM 操作结束后会一直留在后台，
// 窗口的 BrowserWindow + WebContentsView 渲染进程内存随之常驻；
// 这里按「最近一次远程操作用时」判定空闲，由管理器定期回收。
// 纯逻辑实现（不依赖 Electron），便于在 node --test 下覆盖。
// ============================================================

/** 空闲回收的判定输入（由管理器从真实窗口上采集） */
export interface RemoteWindowState {
  /** 远程窗口归属的客户端标识；未显式指定时为 "default" */
  clientId: string;
  /** Electron BrowserWindow.id，用于日志与精确定位 */
  windowId: number;
  /** 最近一次远程（HTTP API）操作命中该窗口的毫秒时间戳 */
  lastUsedAt: number;
  /** 窗口当前是否可见：可见视为用户可能正在查看，不回收 */
  visible: boolean;
  /** 窗口内是否存在进行中的远程调试会话 */
  hasActiveSession: boolean;
}

/** 被判定为空闲、应当回收的窗口 */
export interface RemoteWindowRecycle extends RemoteWindowState {
  idleMs: number;
}

export type RemoteWindowSkipReason = "visible" | "active-session";

/** 已空闲但被保护、本轮不回收的窗口 */
export interface RemoteWindowSkip extends RemoteWindowState {
  idleMs: number;
  reason: RemoteWindowSkipReason;
}

export interface RemoteWindowSweepResult {
  recycled: RemoteWindowRecycle[];
  skipped: RemoteWindowSkip[];
}

/**
 * 单轮空闲判定：
 * - `idleTtlMs <= 0` 表示关闭回收，直接返回空结果；
 * - 未达到空闲阈值的窗口（仍在被使用）既不回收也不上报；
 * - 可见窗口与存在活跃调试会话的窗口计入 `skipped`，避免误杀正在被查看/监听的窗口。
 */
export function sweepIdleRemoteWindows(
  states: readonly RemoteWindowState[],
  now: number,
  idleTtlMs: number
): RemoteWindowSweepResult {
  if (!(idleTtlMs > 0)) return { recycled: [], skipped: [] };

  const recycled: RemoteWindowRecycle[] = [];
  const skipped: RemoteWindowSkip[] = [];
  for (const state of states) {
    const idleMs = Math.max(0, now - state.lastUsedAt);
    if (idleMs < idleTtlMs) continue;
    if (state.visible) {
      skipped.push({ ...state, idleMs, reason: "visible" });
      continue;
    }
    if (state.hasActiveSession) {
      skipped.push({ ...state, idleMs, reason: "active-session" });
      continue;
    }
    recycled.push({ ...state, idleMs });
  }
  return { recycled, skipped };
}

export interface RemoteWindowReaperDependencies {
  /** 空闲阈值（毫秒）；<= 0 表示禁用回收 */
  idleTtlMs: number;
  /** 扫描间隔（毫秒） */
  sweepIntervalMs: number;
  now: () => number;
  setTimer: (callback: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
  /** 采集当前所有远程控制窗口的空闲状态 */
  inspect: () => RemoteWindowState[];
  /** 回收单个窗口（实现方负责真正关闭窗口） */
  recycle: (window: RemoteWindowRecycle) => void;
  /** 本轮存在回收或跳过时的回调，用于日志/可观测性 */
  onSweep?: (result: RemoteWindowSweepResult) => void;
}

/** 定期扫描并回收空闲远程控制窗口；未启动时不做任何事，便于按需启停 */
export class RemoteWindowReaper {
  private dependencies: RemoteWindowReaperDependencies;
  private timer: unknown = null;

  constructor(dependencies: RemoteWindowReaperDependencies) {
    this.dependencies = dependencies;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  /** 启动周期扫描；重复调用与已禁用（idleTtlMs <= 0）时保持原状 */
  start(): void {
    if (this.timer !== null) return;
    if (!(this.dependencies.idleTtlMs > 0)) return;
    this.schedule();
  }

  stop(): void {
    if (this.timer === null) return;
    this.dependencies.clearTimer(this.timer);
    this.timer = null;
  }

  /** 立即扫描一轮（周期回调与手动/测试触发共用） */
  sweep(now: number = this.dependencies.now()): RemoteWindowSweepResult {
    const result = sweepIdleRemoteWindows(
      this.dependencies.inspect(),
      now,
      this.dependencies.idleTtlMs
    );
    for (const window of result.recycled) this.dependencies.recycle(window);
    if (result.recycled.length > 0 || result.skipped.length > 0) {
      this.dependencies.onSweep?.(result);
    }
    return result;
  }

  private schedule(): void {
    this.timer = this.dependencies.setTimer(() => {
      this.timer = null;
      try {
        this.sweep();
      } catch {
        // 回收异常不应中断后续扫描
      }
      this.schedule();
    }, this.dependencies.sweepIntervalMs);
  }
}
