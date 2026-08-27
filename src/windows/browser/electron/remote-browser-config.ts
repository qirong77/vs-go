const DEFAULT_PORT = 18766;

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

export const remoteBrowserConfig = {
  host: "127.0.0.1",
  port: parsePort(process.env.VSGO_REMOTE_BROWSER_PORT),
  allowUnsafeUrls: process.env.VSGO_REMOTE_BROWSER_ALLOW_UNSAFE_URLS === "1",
  allowedOrigins: parseOrigins(process.env.VSGO_REMOTE_BROWSER_CORS_ORIGINS),
  maxBodyBytes: 2 * 1024 * 1024,
  maxResponseBytes: 12 * 1024 * 1024,
  maxConcurrentRequests: 16,
  defaultRequestTimeoutMs: 30_000,
};
