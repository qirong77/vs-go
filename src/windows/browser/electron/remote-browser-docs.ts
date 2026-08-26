import { BrowserWindow } from "electron";
import http from "node:http";
import { vsgoLog } from "@platform/log/logger";

// ============================================================
// Remote Browser Docs
// 为「远程浏览器控制」功能提供一个文档查看窗口。
// 内容实时抓取 remote-browser-server 的 GET /api 自述文档并格式化展示，
// 因此始终与当前服务的真实接口保持一致。
// ============================================================

const API_HOST = "127.0.0.1";
const API_PORT = Number(process.env.VSGO_REMOTE_BROWSER_PORT) || 18766;

interface EnvelopeError {
  code: string;
  message: unknown;
  details?: unknown;
}

interface Envelope {
  ok: boolean;
  data?: unknown;
  error?: EnvelopeError;
  meta: Record<string, unknown>;
}

interface ApiDocData {
  name?: string;
  version?: string;
  description?: string;
  host?: string;
  target_convention?: string;
  response_schema?: unknown;
  endpoints?: Array<{
    method: string;
    path: string;
    description?: string;
    body?: unknown;
    query?: unknown;
    example_request?: unknown;
    example_response?: unknown;
  }>;
}

let docWindow: BrowserWindow | null = null;

function fetchApiDoc(timeoutMs = 3000): Promise<Envelope> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: API_HOST, port: API_PORT, path: "/api", timeout: timeoutMs },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk.toString("utf-8")));
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw) as Envelope);
          } catch (e) {
            reject(new Error(`bad json: ${String(e)}`));
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.on("error", reject);
  });
}

function esc(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsonPretty(input: unknown): string {
  return esc(JSON.stringify(input, null, 2));
}

function renderPage(doc: Envelope, isOnline: boolean): string {
  const d = (doc.data ?? {}) as ApiDocData;
  const endpoints = Array.isArray(d.endpoints) ? d.endpoints : [];

  const endpointRows = endpoints
    .map((ep) => {
      const methodColor =
        ep.method === "GET" ? "#2f6feb" : ep.method === "POST" ? "#d5432f" : "#7d4fbf";
      const bodyBlock = ep.body ? `<pre class="code">${jsonPretty(ep.body)}</pre>` : "";
      const queryBlock = ep.query ? `<pre class="code">${jsonPretty(ep.query)}</pre>` : "";
      const reqBlock =
        ep.example_request !== undefined
          ? `<div class="block"><div class="lbl">请求示例</div><pre class="code">${jsonPretty(
              ep.example_request
            )}</pre></div>`
          : "";
      const respBlock =
        ep.example_response !== undefined
          ? `<div class="block"><div class="lbl">响应示例</div><pre class="code">${jsonPretty(
              ep.example_response
            )}</pre></div>`
          : "";
      return `
        <div class="endpoint" id="ep-${esc(ep.path)}">
          <div class="ep-head">
            <span class="method" style="background:${methodColor}">${esc(ep.method)}</span>
            <code class="path">${esc(ep.path)}</code>
          </div>
          <div class="ep-desc">${esc(ep.description ?? "")}</div>
          ${bodyBlock}
          ${queryBlock}
          ${reqBlock}
          ${respBlock}
        </div>`;
    })
    .join("");

  const onlineBadge = isOnline
    ? `<span class="status online">● 服务在线</span>`
    : `<span class="status offline">● 服务未启动</span>`;

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<title>远程浏览器控制 — 文档</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "PingFang SC", "Segoe UI", sans-serif;
         background: #f7f8fa; color: #1f2328; }
  header { padding: 20px 28px; background: #fff; border-bottom: 1px solid #e5e7eb;
           position: sticky; top: 0; z-index: 5; }
  .title-row { display: flex; align-items: baseline; gap: 12px; }
  h1 { margin: 0; font-size: 18px; }
  .ver { color: #6b7280; font-size: 13px; }
  .status { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 12px; }
  .status.online { background: #e6f4ea; color: #1a7f37; }
  .status.offline { background: #fde7e9; color: #c0241c; }
  .target { margin-top: 10px; background: #f0f3f8; border: 1px solid #dbe2ed; border-radius: 8px;
            padding: 10px 14px; font-size: 12.5px; color: #37404f; line-height: 1.7; }
  .host { font-family: ui-monospace, "SF Mono", Menlo, monospace; color: #0b5cab; }
  main { padding: 24px 28px 60px; max-width: 980px; margin: 0 auto; }
  h2 { font-size: 15px; margin: 28px 0 12px; color: #111827; }
  .schema { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; }
  .endpoint { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
              margin-bottom: 16px; padding: 16px 18px; }
  .ep-head { display: flex; align-items: center; gap: 10px; }
  .method { color: #fff; font-size: 12px; font-weight: 700; padding: 3px 9px;
            border-radius: 5px; letter-spacing: .3px; }
  .ep-path code, code.path { font-family: ui-monospace, "SF Mono", Menlo, monospace;
                             font-size: 14px; color: #0b5cab; }
  .ep-desc { margin-top: 8px; color: #4b5563; font-size: 13px; line-height: 1.6; }
  .block { margin-top: 10px; }
  .lbl { font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: .5px;
         margin-bottom: 4px; }
  pre.code { background: #0d1117; color: #e6edf3; border-radius: 6px; padding: 12px 14px;
             font-size: 12px; overflow-x: auto; line-height: 1.5; margin: 0; }
  .empty { color: #9ca3af; font-size: 13px; padding: 24px 0; text-align: center; }
  a.reload { color: #0b5cab; font-size: 12.5px; text-decoration: none; margin-right: 16px; }
  a.reload:hover { text-decoration: underline; }
</style>
</head>
<body>
<header>
  <div class="title-row">
    <h1>远程浏览器控制</h1>
    <span class="ver">${esc(d.version ?? "v?")}</span>
    ${onlineBadge}
    <span style="flex:1"></span>
    <a class="reload" href="#" onclick="location.reload();return false;">刷新</a>
    <a class="reload" href="http://${esc(API_HOST)}:${API_PORT}/api" target="_blank">原始 JSON</a>
  </div>
  <div class="target">${esc(d.target_convention ?? "通过 body 传 tabId 或 url 定位目标 tab；缺省时操作第一个窗口。")}<br>
    服务地址：<span class="host">http://${esc(API_HOST)}:${API_PORT}</span>${d.host ? ` · 文档：<span class="host">${esc(d.host)}/api</span>` : ""}</div>
</header>
<main>
  <h2>响应格式（Envelope）</h2>
  <div class="schema"><pre class="code">${jsonPretty(d.response_schema ?? {})}</pre></div>

  <h2>接口列表（${endpoints.length} 个）</h2>
  ${endpointRows || `<div class="empty">暂无接口数据</div>`}
</main>
</body>
</html>`;
}

export function openRemoteBrowserDocs(): void {
  if (docWindow && !docWindow.isDestroyed()) {
    docWindow.center();
    docWindow.show();
    docWindow.focus();
    return;
  }

  docWindow = new BrowserWindow({
    width: 900,
    height: 720,
    title: "远程浏览器控制 — 文档",
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
    },
  });
  docWindow.on("closed", () => {
    docWindow = null;
  });

  // 先展示加载态，再异步填充真实 /api 数据
  const load = (): Promise<void> =>
    fetchApiDoc()
      .then((doc) => {
        if (docWindow && !docWindow.isDestroyed()) {
          docWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderPage(doc, true))}`);
        }
      })
      .catch((err) => {
        vsgoLog("RemoteBrowserDocs", "fetch /api failed", { detail: { error: String(err) } });
        const offlineDoc: Envelope = {
          ok: false,
          error: { code: "OFFLINE", message: `无法连接远程浏览器服务 (http://${API_HOST}:${API_PORT})`, details: String(err) },
          meta: { timestamp: new Date().toISOString() },
        };
        if (docWindow && !docWindow.isDestroyed()) {
          docWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderPage(offlineDoc, false))}`);
        }
      });

  void load();
}
