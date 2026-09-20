const DEFAULT_PORT = 18766;
/** 「远程浏览器控制」窗口空闲多久后自动销毁（分钟），0 表示关闭自动回收。 */
const DEFAULT_REMOTE_WINDOW_IDLE_MINUTES = 30;
/** 空闲窗口的扫描间隔（毫秒）。 */
const REMOTE_WINDOW_SWEEP_INTERVAL_MS = 60_000;

function parsePort(value: string | undefined): number {
  if (!value) return DEFAULT_PORT;
  const port = Number(value);
  return Number.isSafeInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_PORT;
}

function parseOrigins(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin && origin !== "*" && origin !== "null")
  );
}

function parseIdleMinutes(value: string | undefined): number {
  if (!value) return DEFAULT_REMOTE_WINDOW_IDLE_MINUTES;
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : DEFAULT_REMOTE_WINDOW_IDLE_MINUTES;
}

export const remoteBrowserConfig = {
  host: "127.0.0.1",
  port: parsePort(process.env.VSGO_REMOTE_BROWSER_PORT),
  allowUnsafeUrls: process.env.VSGO_REMOTE_BROWSER_ALLOW_UNSAFE_URLS === "1",
  allowedOrigins: parseOrigins(process.env.VSGO_REMOTE_BROWSER_CORS_ORIGINS),
  // 空闲回收：超过 remoteWindowIdleMs 没有任何 API 操作的隐藏远程控制窗口会被销毁，
  // 避免各 clientId 的窗口与其页面渲染进程长期驻留后台（内存持续增长）。
  remoteWindowIdleMs:
    parseIdleMinutes(process.env.VSGO_REMOTE_BROWSER_WINDOW_IDLE_MINUTES) * 60_000,
  remoteWindowSweepIntervalMs: REMOTE_WINDOW_SWEEP_INTERVAL_MS,
  maxBodyBytes: 2 * 1024 * 1024,
  maxResponseBytes: 12 * 1024 * 1024,
  maxConcurrentRequests: 16,
  defaultRequestTimeoutMs: 30_000,
};
