import { session, type WebContents } from "electron";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { vsgoLog } from "@platform/log/logger";

// ============================================================
// Chrome Sync Server
// 接收 Chrome 扩展同步过来的 cookies + localStorage：
//   1. cookies -> 直接写入 session.defaultSession
//   2. localStorage -> 存快照，页面加载完成后由 TabbedBrowserWindow 注入
//   3. 数据落盘到项目目录 chrome-sync/latest.json，重启后自动重新应用
// ============================================================

export interface ChromeSyncCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
  sameSite?: "unspecified" | "no_restriction" | "lax" | "strict";
}

export interface ChromeSyncPayload {
  source?: string;
  version?: number;
  timestamp?: number;
  cookies?: ChromeSyncCookie[];
  localStorage?: Record<string, Record<string, string>>;
}

const SYNC_PORT = Number(process.env.VSGO_CHROME_SYNC_PORT) || 18765;
const MAX_BODY_BYTES = 50 * 1024 * 1024;

let server: http.Server | null = null;
let localStorageSnapshot: Record<string, Record<string, string>> = {};
let lastSyncTime = 0;

// ============================================================
// 快照落盘：同步到当前项目
// ============================================================

function getSyncDir(): string {
  return path.join(process.cwd(), "chrome-sync");
}

export function getSnapshotFilePath(): string {
  return path.join(getSyncDir(), "latest.json");
}

function saveSnapshot(payload: ChromeSyncPayload): void {
  try {
    fs.mkdirSync(getSyncDir(), { recursive: true });
    fs.writeFileSync(getSnapshotFilePath(), JSON.stringify(payload, null, 2), "utf-8");
  } catch (error) {
    vsgoLog("ChromeSync", "快照写入失败", { detail: { error: String(error) } });
  }
}

function sanitizeLocalStorage(
  input: unknown
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  if (!input || typeof input !== "object") return out;
  for (const [origin, entries] of Object.entries(input as Record<string, unknown>)) {
    try {
      const u = new URL(origin);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    } catch {
      continue;
    }
    if (!entries || typeof entries !== "object") continue;
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(entries as Record<string, unknown>)) {
      if (typeof v === "string") clean[k] = v;
    }
    if (Object.keys(clean).length > 0) out[origin] = clean;
  }
  return out;
}

// ============================================================
// cookies 应用
// ============================================================

async function applyCookies(cookies: ChromeSyncCookie[]): Promise<{ ok: number; failed: number }> {
  if (!Array.isArray(cookies)) return { ok: 0, failed: 0 };

  const results = await Promise.allSettled(
    cookies.map(async (c) => {
      const domain = (c.domain || "").replace(/^\./, "");
      if (!domain || !c.name) return;
      const scheme = c.secure ? "https" : "http";
      const url = `${scheme}://${domain}${c.path || "/"}`;
      await session.defaultSession.cookies.set({
        url,
        name: c.name,
        value: c.value ?? "",
        path: c.path || "/",
        secure: !!c.secure,
        httpOnly: !!c.httpOnly,
        expirationDate: c.expirationDate,
        sameSite: c.sameSite || "unspecified",
      });
    })
  );

  const ok = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - ok;
  return { ok, failed };
}

// ============================================================
// localStorage 注入（由 TabbedBrowserWindow 在页面加载完成后调用）
// ============================================================

export function injectLocalStorageForWebContents(wc: WebContents): void {
  if (!wc || wc.isDestroyed()) return;
  const url = wc.getURL();
  if (!/^https?:\/\//i.test(url)) return;

  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return;
  }

  const data = localStorageSnapshot[origin];
  if (!data || Object.keys(data).length === 0) return;

  const lines = Object.entries(data).map(
    ([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`
  );
  const script = `(() => {
    try {
      ${lines.join("\n")}
    } catch (e) { console.error("[VsGo chrome-sync] 注入 localStorage 失败:", e); }
  })();`;

  wc.executeJavaScript(script, false).catch((error) => {
    vsgoLog("ChromeSync", "localStorage 注入失败", { detail: { url, error: String(error) } });
  });
}

// ============================================================
// HTTP Server
// ============================================================

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooBig = false;
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf-8");
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        tooBig = true;
        req.destroy();
      }
    });
    req.on("end", () => {
      if (tooBig) reject(new Error("body too large"));
      else resolve(body);
    });
    req.on("error", reject);
  });
}

async function handleSync(payload: ChromeSyncPayload): Promise<Record<string, unknown>> {
  if (!payload || !Array.isArray(payload.cookies)) {
    const err = new Error("invalid payload");
    (err as Error & { statusCode?: number }).statusCode = 400;
    throw err;
  }

  const result = await applyCookies(payload.cookies);
  localStorageSnapshot = sanitizeLocalStorage(payload.localStorage);
  lastSyncTime = payload.timestamp || Date.now();
  saveSnapshot(payload);

  vsgoLog("ChromeSync", "收到扩展同步", {
    detail: {
      cookieOk: result.ok,
      cookieFailed: result.failed,
      localStorageOrigins: Object.keys(localStorageSnapshot).length,
    },
  });

  return {
    ok: true,
    cookieApplied: result.ok,
    cookieFailed: result.failed,
    localStorageOrigins: Object.keys(localStorageSnapshot).length,
    lastSyncTime,
  };
}

export function startChromeSyncServer(): void {
  if (server) return;

  server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    const sendJson = (code: number, data: unknown): void => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      sendJson(200, { ok: true, lastSyncTime });
      return;
    }

    if (req.method === "POST" && req.url === "/sync") {
      readBody(req)
        .then((body) => {
          let payload: ChromeSyncPayload;
          try {
            payload = JSON.parse(body) as ChromeSyncPayload;
          } catch {
            sendJson(400, { ok: false, error: "invalid json" });
            return;
          }
          return handleSync(payload).then((r) => sendJson(200, r));
        })
        .catch((error: Error & { statusCode?: number }) => {
          sendJson(error.statusCode || 500, { ok: false, error: String(error.message || error) });
        });
      return;
    }

    sendJson(404, { ok: false, error: "not found" });
  });

  server.listen(SYNC_PORT, "127.0.0.1", () => {
    vsgoLog("ChromeSync", `同步服务已启动 http://127.0.0.1:${SYNC_PORT}`);
  });
  server.on("error", (error) => {
    vsgoLog("ChromeSync", "同步服务启动失败", { detail: { error: String(error) } });
  });
}

/** 启动时读取项目内的 latest.json，把上次同步的 cookies/localStorage 重新应用 */
export async function loadSnapshotAndApply(): Promise<void> {
  try {
    const file = getSnapshotFilePath();
    if (!fs.existsSync(file)) return;
    const payload = JSON.parse(fs.readFileSync(file, "utf-8")) as ChromeSyncPayload;
    localStorageSnapshot = sanitizeLocalStorage(payload.localStorage);
    lastSyncTime = payload.timestamp || 0;
    const r = await applyCookies(payload.cookies || []);
    vsgoLog("ChromeSync", "已从快照恢复", { detail: r });
  } catch (error) {
    vsgoLog("ChromeSync", "快照恢复失败", { detail: { error: String(error) } });
  }
}

export function getChromeSyncStatus(): { lastSyncTime: number; origins: number } {
  return { lastSyncTime, origins: Object.keys(localStorageSnapshot).length };
}
