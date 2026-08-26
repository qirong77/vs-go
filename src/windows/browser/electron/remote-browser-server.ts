import http from "node:http";
import { vsgoLog } from "@platform/log/logger";
import { TabbedBrowserWindowManager } from "./TabbedBrowserWindowManager";
import type { Tab, TabbedBrowserWindow } from "./TabbedBrowserWindow";

// ============================================================
// Remote Browser Server
// 暴露一个本地 HTTP 接口，让 LLM 直接操控 VsGo 的 tabbed 浏览器：
//   导航 / 执行 JS / 虚拟鼠标(click/hover/scroll/drag) / 键盘 / 截图 / 状态。
//
// 设计要点：
//   - 完全离屏：所有输入经 webContents.sendInputEvent() 与 executeJavaScript()
//     注入目标 tab 的渲染进程，不经过操作系统鼠标，不改变其它应用 focus。
//   - 默认 focus=false；只有显式传 focus:true 才聚焦 VsGo 自身窗口。
//   - 风格对齐 shell-ai-server：Envelope 响应 / GET /api 自述文档 / /browser/* 分组。
// ============================================================

const PORT = Number(process.env.VSGO_REMOTE_BROWSER_PORT) || 18766;
const HOST = "127.0.0.1";
const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB，同 shell-ai-server

const SERVER_VERSION = "1.0.0";

let server: http.Server | null = null;

// ============================================================
// Envelope（对齐 shell-ai-server）
// ============================================================

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

function nowTs(): string {
  return new Date().toISOString();
}

function ok(data?: unknown, meta: Record<string, unknown> = {}): Envelope {
  return { ok: true, data, meta: { ...meta, timestamp: nowTs() } };
}

function fail(
  code: string,
  message: unknown,
  details?: unknown,
  meta: Record<string, unknown> = {}
): Envelope {
  return {
    ok: false,
    error: { code, message, details },
    meta: { ...meta, timestamp: nowTs() },
  };
}

function sendJSON(res: http.ServerResponse, status: number, obj: unknown): void {
  let body: string;
  try {
    body = JSON.stringify(obj, null, 2);
  } catch {
    body = JSON.stringify({
      ok: false,
      error: { code: "ENCODE_ERROR", message: "failed to encode response" },
      meta: { timestamp: nowTs() },
    });
    status = 500;
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.writeHead(status);
  res.end(body);
}

// ============================================================
// 小工具：参数校验与兜底（对齐 shell-ai-server boundedInt/queryStr）
// ============================================================

function clampInt(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/** 把任意值安全地转成 [min,max] 内的整数；失败返回 fallback */
function boundedInt(v: unknown, fallback: number, min: number, max: number): number {
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") {
    const parsed = Number(v);
    if (!Number.isFinite(parsed)) return fallback;
    n = parsed;
  } else return fallback;
  if (!Number.isFinite(n)) return fallback;
  return clampInt(Math.trunc(n), min, max);
}

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

async function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid json: expected object");
  }
  return parsed as Record<string, unknown>;
}

// ============================================================
// 目标解析：tabId / url / 默认第一个
// ============================================================

/** 从 body/query 中取目标 tab（tabId -> url -> 默认第一个 active/first） */
function resolveTarget(body: Record<string, unknown>): { window: TabbedBrowserWindow; tab: Tab } | null {
  const tabId = typeof body.tabId === "string" ? body.tabId : undefined;
  const url = typeof body.url === "string" ? body.url : undefined;
  return TabbedBrowserWindowManager.resolveRemoteTarget({ tabId, url });
}

/** 让目标 tab 聚焦（默认不聚焦，避免抢其它应用 focus） */
function maybeFocus(target: { window: TabbedBrowserWindow; tab: Tab }, body: Record<string, unknown>): void {
  if (body.focus === true) {
    target.window.focusTab(target.tab.id);
  }
}

// ============================================================
// 各操作 handler
// ============================================================

/** 执行 JS。把返回值安全序列化，函数/循环引用等统一转成字符串或抛错。 */
async function handleEvaluate(body: Record<string, unknown>): Promise<Envelope> {
  const script = typeof body.script === "string" ? body.script : "";
  if (!script) return fail("INVALID_ARG", "script is required", { script });

  const target = resolveTarget(body);
  if (!target) return fail("NO_TAB", "no browser tab/window available");

  const userGesture = body.userGesture === true;
  try {
    const raw = await target.window.evaluateOnTab(target.tab.id, script, { userGesture });
    // executeJavaScript 的返回值可能是对象/数组/原子值；尝试 JSON 序列化否则转字符串
    let value: unknown = raw;
    try {
      JSON.stringify(value);
    } catch {
      value = String(value);
    }
    return ok({ value, url: getTabRealUrl(target.tab) });
  } catch (error) {
    return fail("EVALUATE_ERROR", String(error instanceof Error ? error.message : error), {
      script,
    });
  }
}

function getTabRealUrl(tab: Tab): string {
  const win = TabbedBrowserWindowManager.findWindowByTabId(tab.id);
  const wc = win?.getTabWebContents(tab.id);
  return wc ? wc.getURL() : "";
}

/** 截图：返回 PNG base64 与尺寸 */
async function handleScreenshot(body: Record<string, unknown>): Promise<Envelope> {
  const target = resolveTarget(body);
  if (!target) return fail("NO_TAB", "no browser tab/window available");
  try {
    // stayHidden=false 表示窗口可见时正常捕获；窗口隐藏时仍以 hidden 方式捕获。
    const stayHidden = body.stayHidden !== false;
    const shot = await target.window.captureTab(target.tab.id, { stayHidden });
    return ok({
      width: shot.width,
      height: shot.height,
      dataUrl: shot.dataUrl,
      base64: shot.base64,
      mime: "image/png",
      windowVisible: target.window.isWindowVisible(),
      stayHidden,
    });
  } catch (error) {
    return fail("CAPTURE_ERROR", String(error instanceof Error ? error.message : error));
  }
}

/** 打开新 tab / 新窗口 */
function handleOpen(body: Record<string, unknown>): Envelope {
  const url = typeof body.url === "string" && body.url.trim() ? body.url.trim() : null;
  if (!url) return fail("INVALID_ARG", "url is required", { url });
  const win = TabbedBrowserWindowManager.openUrl(url);
  return ok({ windowId: win.hostWindow.id });
}

/** 让活跃 tab 导航到指定 url */
function handleNavigate(body: Record<string, unknown>): Envelope {
  const url = typeof body.url === "string" && body.url.trim() ? body.url.trim() : null;
  if (!url) return fail("INVALID_ARG", "url is required", { url });
  const target = resolveTarget(body);
  if (!target) return fail("NO_TAB", "no browser tab/window available");
  target.window.navigateActive(url);
  return ok({ ok: true, url });
}

/** 切换 tab */
function handleSwitchTab(body: Record<string, unknown>): Envelope {
  const tabId = typeof body.tabId === "string" ? body.tabId : "";
  if (!tabId) return fail("INVALID_ARG", "tabId is required", { tabId });
  const win = TabbedBrowserWindowManager.findWindowByTabId(tabId);
  if (!win || !win.hasTab(tabId)) return fail("TAB_NOT_FOUND", "tab not found", { tabId });
  win.switchTab(tabId);
  if (body.focus === true) win.focusTab(tabId);
  return ok({ ok: true, tabId });
}

/** 关闭 tab */
function handleCloseTab(body: Record<string, unknown>): Envelope {
  const tabId = typeof body.tabId === "string" ? body.tabId : "";
  if (!tabId) return fail("INVALID_ARG", "tabId is required", { tabId });
  const win = TabbedBrowserWindowManager.findWindowByTabId(tabId);
  if (!win || !win.hasTab(tabId)) return fail("TAB_NOT_FOUND", "tab not found", { tabId });
  win.closeTab(tabId);
  return ok({ ok: true, tabId });
}

/** 后退/前进/刷新 */
function handleHistory(body: Record<string, unknown>, action: "back" | "forward" | "reload"): Envelope {
  const target = resolveTarget(body);
  if (!target) return fail("NO_TAB", "no browser tab/window available");
  const wc = target.window.getTabWebContents(target.tab.id);
  if (!wc) return fail("TAB_DESTROYED", "tab webContents destroyed");
  if (action === "back") target.window.goBack();
  else if (action === "forward") target.window.goForward();
  else target.window.reload();
  return ok({ ok: true, action });
}

/**
 * 虚拟鼠标点击。支持两种方式：
 *   - mode="js"（默认）：页面内执行 JS 找元素并 click()，最稳、零 focus 影响。
 *   - mode="mouse"：JS 算元素中心坐标，用 sendInputEvent 发 mouseDown/mouseUp。
 */
async function handleClick(body: Record<string, unknown>): Promise<Envelope> {
  const selector = typeof body.selector === "string" ? body.selector : "";
  if (!selector) return fail("INVALID_ARG", "selector is required", { selector });

  const target = resolveTarget(body);
  if (!target) return fail("NO_TAB", "no browser tab/window available");

  const mode = body.mode === "mouse" ? "mouse" : "js";

  if (mode === "js") {
    const clickScript = `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false, reason: 'not found', selector: ${JSON.stringify(selector)} };
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.click();
      return { ok: true, tag: el.tagName, text: (el.textContent||'').trim().slice(0,120) };
    })()`;
    try {
      const res = await target.window.evaluateOnTab(target.tab.id, clickScript);
      const r = res as { ok: boolean; reason?: string; tag?: string; text?: string };
      if (!r?.ok) return fail("ELEMENT_NOT_FOUND", r?.reason ?? "element not found", { selector });
      return ok({ mode: "js", selector, tag: r.tag, text: r.text });
    } catch (error) {
      return fail("CLICK_ERROR", String(error instanceof Error ? error.message : error), { selector });
    }
  }

  // mouse 模式：算坐标 -> sendInputEvent
  const rectScript = `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false, reason: 'not found', selector: ${JSON.stringify(selector)} };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return { ok: true, x: r.left + r.width/2, y: r.top + r.height/2, tag: el.tagName, text: (el.textContent||'').trim().slice(0,120) };
  })()`;
  try {
    const res = (await target.window.evaluateOnTab(target.tab.id, rectScript)) as {
      ok: boolean;
      reason?: string;
      x?: number;
      y?: number;
      tag?: string;
      text?: string;
    };
    if (!res?.ok) return fail("ELEMENT_NOT_FOUND", res?.reason ?? "element not found", { selector });
    const x = Math.round(Number(res.x));
    const y = Math.round(Number(res.y));
    maybeFocus(target, body);
    target.window.sendInputToTab(target.tab.id, { type: "mouseMove", x, y });
    target.window.sendInputToTab(target.tab.id, { type: "mouseDown", x, y, button: "left", clickCount: 1 });
    target.window.sendInputToTab(target.tab.id, { type: "mouseUp", x, y, button: "left", clickCount: 1 });
    return ok({ mode: "mouse", selector, x, y, tag: res.tag, text: res.text });
  } catch (error) {
    return fail("CLICK_ERROR", String(error instanceof Error ? error.message : error), { selector });
  }
}

/** 鼠标移动（hover）到某个选择器中心 */
async function handleHover(body: Record<string, unknown>): Promise<Envelope> {
  const selector = typeof body.selector === "string" ? body.selector : "";
  if (!selector) return fail("INVALID_ARG", "selector is required", { selector });
  const target = resolveTarget(body);
  if (!target) return fail("NO_TAB", "no browser tab/window available");

  const rectScript = `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false, reason: 'not found' };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return { ok: true, x: r.left + r.width/2, y: r.top + r.height/2, tag: el.tagName };
  })()`;
  try {
    const res = (await target.window.evaluateOnTab(target.tab.id, rectScript)) as {
      ok: boolean;
      reason?: string;
      x?: number;
      y?: number;
      tag?: string;
    };
    if (!res?.ok) return fail("ELEMENT_NOT_FOUND", res?.reason ?? "element not found", { selector });
    const x = Math.round(Number(res.x));
    const y = Math.round(Number(res.y));
    maybeFocus(target, body);
    target.window.sendInputToTab(target.tab.id, { type: "mouseMove", x, y });
    return ok({ selector, x, y, tag: res.tag });
  } catch (error) {
    return fail("HOVER_ERROR", String(error instanceof Error ? error.message : error), { selector });
  }
}

/** 滚动：absolute 坐标滚轮，或按选择器滚动 */
function handleScroll(body: Record<string, unknown>): Envelope {
  const target = resolveTarget(body);
  if (!target) return fail("NO_TAB", "no browser tab/window available");

  const x = boundedInt(body.x, 0, -100000, 100000);
  const y = boundedInt(body.y, 0, -100000, 100000);
  const deltaX = boundedInt(body.deltaX, 0, -100000, 100000);
  const deltaY = boundedInt(body.deltaY, 0, -100000, 100000);

  maybeFocus(target, body);
  target.window.sendInputToTab(target.tab.id, {
    type: "mouseWheel",
    x,
    y,
    deltaX,
    deltaY,
    canScroll: true,
  });
  return ok({ x, y, deltaX, deltaY });
}

/** 虚拟鼠标拖拽：mouseDown -> 多个 mouseMove -> mouseUp（默认左键） */
function handleDrag(body: Record<string, unknown>): Envelope {
  const target = resolveTarget(body);
  if (!target) return fail("NO_TAB", "no browser tab/window available");

  const fromX = boundedInt(body.fromX, 0, -100000, 100000);
  const fromY = boundedInt(body.fromY, 0, -100000, 100000);
  const toX = boundedInt(body.toX, 0, -100000, 100000);
  const toY = boundedInt(body.toY, 0, -100000, 100000);
  const button = body.button === "right" ? "right" : body.button === "middle" ? "middle" : "left";

  maybeFocus(target, body);
  target.window.sendInputToTab(target.tab.id, {
    type: "mouseMove",
    x: fromX,
    y: fromY,
  });
  target.window.sendInputToTab(target.tab.id, {
    type: "mouseDown",
    x: fromX,
    y: fromY,
    button,
    clickCount: 1,
  });
  // 若干中间点平滑移动，便于触发 drag 相关行为
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const x = Math.round(fromX + ((toX - fromX) * i) / steps);
    const y = Math.round(fromY + ((toY - fromY) * i) / steps);
    target.window.sendInputToTab(target.tab.id, { type: "mouseMove", x, y });
  }
  target.window.sendInputToTab(target.tab.id, {
    type: "mouseUp",
    x: toX,
    y: toY,
    button,
    clickCount: 1,
  });
  return ok({ fromX, fromY, toX, toY, button });
}

/** DOM 查询：返回匹配元素简要信息（tag/id/class/text/rect），供 LLM 编写选择器 */
async function handleQueryDom(body: Record<string, unknown>): Promise<Envelope> {
  const selector = typeof body.selector === "string" ? body.selector : "";
  if (!selector) return fail("INVALID_ARG", "selector is required", { selector });
  const target = resolveTarget(body);
  if (!target) return fail("NO_TAB", "no browser tab/window available");
  const limit = boundedInt(body.limit, 20, 1, 200);
  const attr = typeof body.attr === "string" ? JSON.stringify(body.attr) : "null";

  const queryScript = `(() => {
    const els = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).slice(0, ${limit});
    const attr = ${attr};
    return els.map((el) => {
      const r = el.getBoundingClientRect();
      const out = {
        tag: el.tagName,
        id: el.id || undefined,
        cls: typeof el.className === 'string' ? el.className : '',
        text: (el.textContent || '').trim().slice(0, 160),
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      };
      if (attr) out.attr = el.getAttribute && el.getAttribute(attr);
      return out;
    });
  })()`;
  try {
    const res = await target.window.evaluateOnTab(target.tab.id, queryScript);
    return ok({ selector, count: Array.isArray(res) ? res.length : 0, elements: res });
  } catch (error) {
    return fail("QUERY_ERROR", String(error instanceof Error ? error.message : error), { selector });
  }
}

/** 键盘输入：keyDown/keyUp。key 为 Electron KeyInput，如 "Enter", "Tab", "Escape", "a" */
function handlePressKey(body: Record<string, unknown>): Envelope {
  const key = typeof body.key === "string" ? body.key : "";
  if (!key) return fail("INVALID_ARG", "key is required", { key });
  const target = resolveTarget(body);
  if (!target) return fail("NO_TAB", "no browser tab/window available");
  maybeFocus(target, body);
  const modifiers = body.modifiers as Electron.KeyboardInputEvent["modifiers"] | undefined;
  const keyCode = typeof body.keyCode === "string" ? body.keyCode : key;
  target.window.sendInputToTab(target.tab.id, {
    type: "keyDown",
    keyCode,
    modifiers,
  });
  target.window.sendInputToTab(target.tab.id, {
    type: "keyUp",
    keyCode,
    modifiers,
  });
  return ok({ key });
}

/** 输入文本：先聚焦目标 tab（页面内 focus），再用 char 逐字发送（可选） */
async function handleTypeText(body: Record<string, unknown>): Promise<Envelope> {
  const text = typeof body.text === "string" ? body.text : "";
  if (!text) return fail("INVALID_ARG", "text is required", { text });
  const target = resolveTarget(body);
  if (!target) return fail("NO_TAB", "no browser tab/window available");

  // 先尝试页面内 focus 到 document.body / 当前焦点元素，避免系统 focus 干扰
  const focusScript = `(() => {
    const el = document.activeElement;
    if (el) { try { el.focus(); } catch {} }
    return el ? { tag: el.tagName } : { tag: 'none' };
  })()`;
  try {
    await target.window.evaluateOnTab(target.tab.id, focusScript);
  } catch {
    // ignore
  }

  maybeFocus(target, body);
  // 用 sendInputEvent 逐字符注入（keyCode 为字符本身，等价于虚拟键盘键入）
  for (const char of text) {
    target.window.sendInputToTab(target.tab.id, { type: "char", keyCode: char });
  }
  return ok({ text, length: text.length });
}

/** 等待：等选择器出现/等加载完成，带超时轮询 */
async function handleWait(body: Record<string, unknown>): Promise<Envelope> {
  const target = resolveTarget(body);
  if (!target) return fail("NO_TAB", "no browser tab/window available");
  const timeoutMs = boundedInt(body.timeout, 5000, 100, 60000);
  const selector = typeof body.selector === "string" ? body.selector : "";

  const start = Date.now();
  for (;;) {
    if (Date.now() - start > timeoutMs) {
      return fail("TIMEOUT", `timeout after ${timeoutMs}ms`, { selector });
    }
    try {
      const ready = await target.window.evaluateOnTab(
        target.tab.id,
        selector
          ? `!!document.querySelector(${JSON.stringify(selector)})`
          : `document.readyState === 'complete'`
      );
      if (ready) {
        return ok({ selector: selector || null, waitedMs: Date.now() - start });
      }
    } catch {
      // 页面可能还在导航中，继续等待
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}

/** 读取页面可读文本（可选 selector 范围），便于 LLM 理解页面 */
async function handleRead(body: Record<string, unknown>): Promise<Envelope> {
  const target = resolveTarget(body);
  if (!target) return fail("NO_TAB", "no browser tab/window available");
  const selector = typeof body.selector === "string" && body.selector ? body.selector : "body";
  const readScript = `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false, reason: 'not found' };
    return {
      ok: true,
      text: (el.innerText || '').trim(),
      html_len: (el.innerHTML||'').length,
      tag: el.tagName
    };
  })()`;
  try {
    const res = (await target.window.evaluateOnTab(target.tab.id, readScript)) as {
      ok: boolean;
      reason?: string;
      text?: string;
      html_len?: number;
      tag?: string;
    };
    if (!res?.ok) return fail("ELEMENT_NOT_FOUND", res?.reason ?? "element not found", { selector });
    const max = boundedInt(body.maxLength, 8000, 0, 200000);
    return ok({
      selector,
      tag: res.tag,
      length: (res.text ?? "").length,
      text: max > 0 ? (res.text ?? "").slice(0, max) : res.text,
    });
  } catch (error) {
    return fail("READ_ERROR", String(error instanceof Error ? error.message : error), { selector });
  }
}

/** 读取当前窗口/tab 状态列表 */
function handleListWindows(): Envelope {
  const windows = TabbedBrowserWindowManager.getAllWindows();
  const data = windows.map((w) => {
    const state = w.getState();
    return {
      windowId: w.hostWindow.id,
      title: w.hostWindow.getTitle(),
      visible: w.hostWindow.isVisible(),
      activeTabId: state.activeTabId,
      tabs: state.tabs.map((t) => ({
        id: t.id,
        url: t.url,
        title: t.title,
        loading: t.loading,
        canGoBack: t.canGoBack,
        canGoForward: t.canGoForward,
      })),
    };
  });
  return ok(data);
}

/** 读取指定 tab 的当前状态 */
function handleGetState(body: Record<string, unknown>): Envelope {
  const target = resolveTarget(body);
  if (!target) return fail("NO_TAB", "no browser tab/window available");
  const wc = target.window.getTabWebContents(target.tab.id);
  if (!wc) return fail("TAB_DESTROYED", "tab webContents destroyed");
  return ok({
    tabId: target.tab.id,
    windowId: target.window.hostWindow.id,
    url: target.window.getActiveUrl(),
    title: wc.getTitle(),
    loading: wc.isLoading(),
    canGoBack: wc.navigationHistory.canGoBack(),
    canGoForward: wc.navigationHistory.canGoForward(),
    windowVisible: target.window.isWindowVisible(),
  });
}

/** 让目标窗口显示并聚焦（隐藏状态下恢复可见，便于用户查看或继续操作） */
function handleWindowShow(body: Record<string, unknown>): Envelope {
  const target = resolveTarget(body);
  if (!target) return fail("NO_WINDOW", "no browser window available");
  target.window.showAndFocus();
  return ok({ windowId: target.window.hostWindow.id, visible: true });
}

/** 隐藏目标窗口（不改变其它应用 focus） */
function handleWindowHide(body: Record<string, unknown>): Envelope {
  // 允许仅按 windowId 定位
  const windowId = body.windowId as number | undefined;
  let win: TabbedBrowserWindow | null = null;
  if (typeof windowId === "number") {
    win = TabbedBrowserWindowManager.findByHostId(windowId) ?? null;
  }
  if (!win) {
    const target = resolveTarget(body);
    if (target) win = target.window;
  }
  if (!win) return fail("NO_WINDOW", "no browser window to hide");
  win.hide();
  return ok({ windowId: win.hostWindow.id, visible: false });
}

/** 聚焦目标窗口（在 VsGo 内部聚焦自身窗口，不抢其它应用焦点） */
function handleWindowFocus(body: Record<string, unknown>): Envelope {
  const target = resolveTarget(body);
  if (!target) return fail("NO_WINDOW", "no browser window available");
  target.window.showAndFocus();
  return ok({ windowId: target.window.hostWindow.id, focused: true });
}

/** 打开/关闭 DevTools */
function handleDevTools(body: Record<string, unknown>, open: boolean): Envelope {
  const target = resolveTarget(body);
  if (!target) return fail("NO_TAB", "no browser tab/window available");
  const wc = target.window.getTabWebContents(target.tab.id);
  if (!wc) return fail("TAB_DESTROYED", "tab webContents destroyed");
  if (open) wc.openDevTools({ mode: "detach" });
  else wc.closeDevTools();
  return ok({ open });
}

// ============================================================
// GET /api 自述文档（对齐 shell-ai-server 风格，含请求/响应示例）
// ============================================================

interface EndpointDoc {
  method: string;
  path: string;
  description: string;
  body?: unknown;
  query?: unknown;
  example_request?: unknown;
  example_response?: unknown;
}

const endpoints: EndpointDoc[] = [
  {
    method: "GET",
    path: "/browser/windows",
    description: "列出所有浏览器窗口及其 tab 状态。",
  },
  {
    method: "GET",
    path: "/browser/state",
    description: "读取指定 tab 的当前状态（url/title/loading/前进后退）。body 可选传 tabId 或 url 定位 tab。",
    query: { tabId: "string optional", url: "string optional" },
  },
  {
    method: "POST",
    path: "/browser/open",
    description: "打开一个新 tab（或新窗口）并导航到 url。",
    example_request: { url: "http://localhost:3000/storeManagement/Score?env=150" },
    example_response: ok({ windowId: 3 }),
  },
  {
    method: "POST",
    path: "/browser/navigate",
    description: "让当前 tab 导航到 url。",
    body: { url: "string", tabId: "string optional", url_match: "string optional" },
    example_request: { url: "http://localhost:3000/storeManagement/Score?env=150" },
    example_response: ok({ ok: true, url: "http://localhost:3000/storeManagement/Score?env=150" }),
  },
  {
    method: "POST",
    path: "/browser/evaluate",
    description: "在目标 tab 页面内执行 JS，返回序列化结果。这是最强大的调试入口。",
    body: { script: "string", userGesture: "boolean optional", tabId: "string optional", url: "string optional" },
    example_request: { script: "document.title", tabId: "tab_xxx" },
    example_response: ok({ value: "Score 页面", url: "http://localhost:3000/..." }),
  },
  {
    method: "POST",
    path: "/browser/click",
    description: "虚拟鼠标点击元素。mode=js 默认用页面内 click()；mode=mouse 用合成 mouseDown/Up。",
    body: { selector: "string|css", mode: "js|mouse", tabId: "string optional", url: "string optional", focus: "boolean optional" },
    example_request: { selector: "button.submit", mode: "js" },
    example_response: ok({ mode: "js", selector: "button.submit", tag: "BUTTON", text: "提交" }),
  },
  {
    method: "POST",
    path: "/browser/hover",
    description: "鼠标移动到元素中心（虚拟 hover）。",
    body: { selector: "string|css", tabId: "string optional", url: "string optional" },
    example_request: { selector: "div.dropdown" },
  },
  {
    method: "POST",
    path: "/browser/scroll",
    description: "在指定坐标用鼠标滚轮滚动。deltaY>0 向下，<0 向上。",
    body: { x: "number optional=0", y: "number optional=0", deltaX: "number optional=0", deltaY: "number optional=0", tabId: "string optional", url: "string optional" },
    example_request: { x: 400, y: 300, deltaY: 480 },
  },
  {
    method: "POST",
    path: "/browser/drag",
    description: "虚拟鼠标拖拽（mouseDown -> 平滑 mouseMove -> mouseUp）。用于拖拽控件、滑块等。",
    body: { fromX: "number", fromY: "number", toX: "number", toY: "number", button: "left|middle|right optional", tabId: "string optional", url: "string optional" },
    example_request: { fromX: 100, fromY: 200, toX: 360, toY: 200 },
  },
  {
    method: "POST",
    path: "/browser/query",
    description: "DOM 查询：返回匹配选择器元素的 tag/id/class/text/rect，供 LLM 定位与编写选择器。",
    body: { selector: "string|css", limit: "number optional=20", attr: "string optional", tabId: "string optional", url: "string optional" },
    example_request: { selector: "button", limit: 10 },
  },
  {
    method: "POST",
    path: "/browser/key",
    description: "按下并释放一个按键（Electron Key Input，如 Enter/Tab/Escape）。",
    body: { key: "string", modifiers: "string[] optional", tabId: "string optional", url: "string optional" },
    example_request: { key: "Enter" },
  },
  {
    method: "POST",
    path: "/browser/type",
    description: "逐字输入文本到当前焦点输入框（虚拟键盘 char 事件）。",
    body: { text: "string", tabId: "string optional", url: "string optional" },
    example_request: { text: "hello" },
  },
  {
    method: "POST",
    path: "/browser/wait",
    description: "等待选择器出现或页面加载完成（轮询，带超时）。",
    body: { selector: "string optional", timeout: "number optional=5000", tabId: "string optional", url: "string optional" },
    example_request: { selector: "div.app-ready", timeout: 8000 },
  },
  {
    method: "POST",
    path: "/browser/read",
    description: "读取页面可读文本（innerText），默认整个 body，maxLength 限制长度。",
    body: { selector: "string optional=body", maxLength: "number optional=8000", tabId: "string optional", url: "string optional" },
    example_request: { selector: "main", maxLength: 4000 },
  },
  {
    method: "POST",
    path: "/browser/screenshot",
    description: "截取当前 tab 页面，返回 PNG base64 与尺寸。窗口隐藏时也能捕获（stayHidden 默认 true）。",
    body: { tabId: "string optional", url: "string optional", stayHidden: "boolean optional=true" },
    example_request: { tabId: "tab_xxx" },
  },
  {
    method: "POST",
    path: "/browser/window/show",
    description: "显示并聚焦目标浏览器窗口（隐藏状态下恢复可见）。",
    body: { tabId: "string optional", url: "string optional" },
  },
  {
    method: "POST",
    path: "/browser/window/hide",
    description: "隐藏目标浏览器窗口，不改变其它应用 focus。可按 windowId 定位。",
    body: { windowId: "number optional", tabId: "string optional", url: "string optional" },
  },
  {
    method: "POST",
    path: "/browser/window/focus",
    description: "聚焦目标浏览器窗口（在 VsGo 内部聚焦自身窗口）。",
    body: { tabId: "string optional", url: "string optional" },
  },
  {
    method: "POST",
    path: "/browser/back",
    description: "后退。",
  },
  {
    method: "POST",
    path: "/browser/forward",
    description: "前进。",
  },
  {
    method: "POST",
    path: "/browser/reload",
    description: "刷新当前页。",
  },
  {
    method: "POST",
    path: "/browser/switch-tab",
    description: "切换到指定 tabId。",
    body: { tabId: "string" },
  },
  {
    method: "POST",
    path: "/browser/close-tab",
    description: "关闭指定 tabId。",
    body: { tabId: "string" },
  },
  {
    method: "POST",
    path: "/browser/devtools",
    description: "打开/关闭 DevTools。open=true 左侧时打开。",
    body: { open: "boolean", tabId: "string optional", url: "string optional" },
  },
];

function buildApiDoc(): Envelope {
  return ok({
    name: "vsgo-remote-browser-server",
    version: SERVER_VERSION,
    description:
      "远程操控 VsGo tabbed 浏览器的本地 HTTP 服务。所有输入经 webContents 合成事件注入，离屏、不依赖系统鼠标、默认不改变其它应用 focus。",
    host: `http://${HOST}:${PORT}`,
    target_convention:
      "各操作接口通过 body 传 tabId 或 url 定位目标 tab；二者都缺省时默认操作第一个窗口的第一个/当前 tab。url 匹配忽略 hash 与尾部斜杠，保留 query。",
    response_schema: {
      ok: "boolean",
      data: "any (仅成功)",
      error: { code: "string (如 NO_TAB/INVALID_ARG)", message: "any", details: "any" },
      meta: { timestamp: "ISO8601" },
    },
    endpoints,
  });
}

function handleApiDocs(res: http.ServerResponse): void {
  sendJSON(res, 200, buildApiDoc());
}

function handleRoot(res: http.ServerResponse): void {
  sendJSON(res, 200, ok({
    name: "vsgo-remote-browser-server",
    version: SERVER_VERSION,
    description: "远程浏览器控制服务（离屏虚拟输入，不依赖系统鼠标）",
    doc: `GET /api`,
    health: `GET /health`,
  }));
}

// ============================================================
// 路由
// ============================================================

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const method = req.method ?? "GET";

  // 参数混合查询串与 JSON body：query 优先，body 覆盖
  let body: Record<string, unknown> = {};
  if (method === "POST" || method === "PUT" || method === "DELETE") {
    try {
      body = await parseBody(req);
    } catch (error) {
      sendJSON(res, 400, fail("INVALID_JSON", String(error instanceof Error ? error.message : error)));
      return;
    }
  }
  // 把 query 字符串并入 body（作为默认值）
  for (const [k, v] of url.searchParams.entries()) {
    if (body[k] === undefined) body[k] = v;
  }

  try {
    if (method === "GET" && path === "/health") {
      sendJSON(res, 200, ok({ status: "healthy", windows: TabbedBrowserWindowManager.getAllWindows().length }));
      return;
    }
    if (method === "GET" && path === "/api") return handleApiDocs(res);
    if (method === "GET" && path === "/") return handleRoot(res);

    if (path === "/browser/windows") return sendJSON(res, 200, handleListWindows());
    if (path === "/browser/state") return sendJSON(res, 200, handleGetState(body));
    if (path === "/browser/open") return sendJSON(res, 200, handleOpen(body));
    if (path === "/browser/navigate") return sendJSON(res, 200, handleNavigate(body));
    if (path === "/browser/switch-tab") return sendJSON(res, 200, handleSwitchTab(body));
    if (path === "/browser/close-tab") return sendJSON(res, 200, handleCloseTab(body));
    if (path === "/browser/back") return sendJSON(res, 200, handleHistory(body, "back"));
    if (path === "/browser/forward") return sendJSON(res, 200, handleHistory(body, "forward"));
    if (path === "/browser/reload") return sendJSON(res, 200, handleHistory(body, "reload"));
    if (path === "/browser/scroll") return sendJSON(res, 200, handleScroll(body));
    if (path === "/browser/drag") return sendJSON(res, 200, handleDrag(body));
    if (path === "/browser/key") return sendJSON(res, 200, handlePressKey(body));
    if (path === "/browser/type") return sendJSON(res, 200, await handleTypeText(body));
    if (path === "/browser/wait") return sendJSON(res, 200, await handleWait(body));
    if (path === "/browser/read") return sendJSON(res, 200, await handleRead(body));
    if (path === "/browser/query") return sendJSON(res, 200, await handleQueryDom(body));
    if (path === "/browser/window/show") return sendJSON(res, 200, handleWindowShow(body));
    if (path === "/browser/window/hide") return sendJSON(res, 200, handleWindowHide(body));
    if (path === "/browser/window/focus") return sendJSON(res, 200, handleWindowFocus(body));

    // async handlers
    if (path === "/browser/evaluate") return sendJSON(res, 200, await handleEvaluate(body));
    if (path === "/browser/click") return sendJSON(res, 200, await handleClick(body));
    if (path === "/browser/hover") return sendJSON(res, 200, await handleHover(body));
    if (path === "/browser/screenshot") return sendJSON(res, 200, await handleScreenshot(body));
    if (path === "/browser/devtools") return sendJSON(res, 200, handleDevTools(body, body.open === true));

    sendJSON(res, 404, fail("NOT_FOUND", `unknown route: ${method} ${path}`));
  } catch (error) {
    vsgoLog("RemoteBrowser", "handler error", { detail: { path, error: String(error) } });
    sendJSON(res, 500, fail("INTERNAL_ERROR", String(error instanceof Error ? error.message : error)));
  }
}

export function startRemoteBrowserServer(): void {
  if (server) return;

  server = http.createServer((req, res) => {
    // CORS 预检
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    handleRequest(req, res).catch((error) => {
      vsgoLog("RemoteBrowser", "unhandled", { detail: { error: String(error) } });
      sendJSON(res, 500, fail("INTERNAL_ERROR", String(error instanceof Error ? error.message : error)));
    });
  });

  server.listen(PORT, HOST, () => {
    vsgoLog("RemoteBrowser", `已启动 http://${HOST}:${PORT}（GET /api 查看文档）`);
  });

  server.on("error", (error) => {
    vsgoLog("RemoteBrowser", "启动失败", { detail: { error: String(error) } });
  });
}

export function getRemoteBrowserStatus(): { port: number; running: boolean } {
  return { port: PORT, running: !!server };
}
