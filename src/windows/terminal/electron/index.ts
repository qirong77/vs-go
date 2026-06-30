import { BrowserWindow, app, dialog, ipcMain, session } from "electron";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import { request } from "node:http";
import { createServer } from "node:net";
import path from "node:path";
import { is } from "@electron-toolkit/utils";
import { createWindowRef, openManagedSubWindow } from "@platform/electron/managedSubWindow";
import { vsgoLog } from "@platform/log/logger";
import { generateId } from "@shared/utils";
import { TerminalEvent } from "../events";

const windowRef = createWindowRef();
const RANDOM_PORT_MIN = 49152;
const RANDOM_PORT_MAX = 65535;
const TTYD_READY_TIMEOUT_MS = 8000;
const TTYD_CWD = process.env["M_VITE_TTYD_CWD"] || process.env["HOME"] || process.cwd();

type TerminalStatus = "starting" | "ready";

interface TerminalCredential {
  username: string;
  password: string;
}

interface TerminalTab {
  id: string;
  port: number;
  title: string;
  process: ChildProcessWithoutNullStreams;
  credential: TerminalCredential;
  status: TerminalStatus;
}

let tabs: TerminalTab[] = [];
let activeTabId: string | null = null;
let shutdownHookRegistered = false;
let ipcRegistered = false;
let mainWindow: BrowserWindow | null = null;
let resolvedTtydBin: string | null = null;
let pendingInitialTab: Promise<void> | null = null;
let authInterceptorRegistered = false;
const reservedPorts = new Set<number>();

function getShellCommand(): string {
  if (process.env["SHELL"]) return process.env["SHELL"];
  return process.platform === "win32" ? "powershell.exe" : "/bin/bash";
}

function getTtydCandidates(): string[] {
  return [
    process.env["M_VITE_TTYD_BIN"],
    "ttyd",
    "/opt/homebrew/bin/ttyd",
    "/usr/local/bin/ttyd",
  ].filter((candidate): candidate is string => Boolean(candidate));
}

function resolveTtydBinary(): string | null {
  for (const candidate of getTtydCandidates()) {
    const result = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (!result.error) return candidate;

    const error = result.error as NodeJS.ErrnoException;
    if (error.code !== "ENOENT") return candidate;
  }
  return null;
}

function showMissingTtydDialog(): void {
  const hint =
    process.platform === "darwin"
      ? "可以先执行：brew install ttyd"
      : "请先安装 ttyd，并确保 ttyd 命令在 PATH 中。";

  dialog.showErrorBox(
    "未找到 ttyd",
    `${hint}\n\n如果 ttyd 已安装但 App 找不到，可以通过 M_VITE_TTYD_BIN 指定 ttyd 的完整路径。`
  );
}

function ensureShutdownHook(): void {
  if (shutdownHookRegistered) return;
  shutdownHookRegistered = true;
  app.once("before-quit", () => {
    closeAllTerminalTabs();
  });
}

function stopTerminalProcess(tab: TerminalTab): void {
  reservedPorts.delete(tab.port);
  try {
    if (tab.process && !tab.process.killed) tab.process.kill();
  } catch {
    // ignore
  }
}

function closeAllTerminalTabs(): void {
  const closingTabs = tabs;
  tabs = [];
  activeTabId = null;
  for (const tab of closingTabs) {
    stopTerminalProcess(tab);
  }
  reservedPorts.clear();
}

function randomPort(): number {
  const range = RANDOM_PORT_MAX - RANDOM_PORT_MIN + 1;
  return RANDOM_PORT_MIN + (randomBytes(2).readUInt16BE(0) % range);
}

function canBindPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

function getEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate terminal port")));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

async function allocatePort(): Promise<number> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const port = randomPort();
    if (reservedPorts.has(port)) continue;
    if (await canBindPort(port)) {
      reservedPorts.add(port);
      return port;
    }
  }

  const port = await getEphemeralPort();
  reservedPorts.add(port);
  return port;
}

function createCredential(): TerminalCredential {
  return {
    username: `vsgo_${randomBytes(6).toString("hex")}`,
    password: randomBytes(24).toString("hex"),
  };
}

function terminalUrl(tab: TerminalTab): string {
  return `http://127.0.0.1:${tab.port}`;
}

function authHeader(tab: TerminalTab): string {
  const raw = `${tab.credential.username}:${tab.credential.password}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

function findTabByLocalUrl(targetUrl: string): TerminalTab | null {
  try {
    const url = new URL(targetUrl);
    if (url.hostname !== "127.0.0.1") return null;
    const port = Number(url.port);
    return tabs.find((tab) => tab.port === port) ?? null;
  } catch {
    return null;
  }
}

function spawnTtyd(port: number, credential: TerminalCredential): ChildProcessWithoutNullStreams {
  ensureShutdownHook();
  const shell = getShellCommand();
  const proc = spawn(
    resolvedTtydBin!,
    [
      "-W",
      "-i",
      "127.0.0.1",
      "-p",
      String(port),
      "-c",
      `${credential.username}:${credential.password}`,
      shell,
    ],
    {
      cwd: TTYD_CWD,
      stdio: "pipe",
      env: process.env,
    }
  );

  proc.stdout.on("data", (chunk) => {
    const message = String(chunk).trim();
    if (message) vsgoLog("Terminal", `[${port}] ${message}`);
  });

  proc.stderr.on("data", (chunk) => {
    const message = String(chunk).trim();
    if (message) vsgoLog("Terminal", `[${port}] ${message}`, { level: "warn" });
  });

  proc.on("error", (error: NodeJS.ErrnoException) => {
    reservedPorts.delete(port);
    vsgoLog("Terminal", `ttyd [${port}] 启动失败`, {
      level: "error",
      detail: { message: error.message, code: error.code },
    });
  });

  proc.on("exit", (code, signal) => {
    reservedPorts.delete(port);
    vsgoLog("Terminal", `ttyd [${port}] 已退出`, { detail: { code, signal } });
    const idx = tabs.findIndex((t) => t.process === proc);
    if (idx !== -1) {
      const closedId = tabs[idx].id;
      tabs.splice(idx, 1);
      if (activeTabId === closedId) {
        activeTabId = tabs.length > 0 ? tabs[tabs.length - 1].id : null;
      }
      broadcastState();
    }
  });

  vsgoLog("Terminal", `ttyd 启动中 [${port}]`, {
    detail: { url: `http://127.0.0.1:${port}`, shell, port, cwd: TTYD_CWD },
  });

  return proc;
}

function serializeState(): {
  tabs: Array<{
    id: string;
    port: number;
    title: string;
    status: TerminalStatus;
    url: string | null;
  }>;
  activeTabId: string | null;
} {
  return {
    tabs: tabs.map((tab) => ({
      id: tab.id,
      port: tab.port,
      title: tab.title,
      status: tab.status,
      url: tab.status === "ready" ? terminalUrl(tab) : null,
    })),
    activeTabId,
  };
}

function broadcastState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(TerminalEvent.STATE_UPDATED, serializeState());
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function probeTtyd(tab: TerminalTab): Promise<boolean> {
  return new Promise((resolve) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port: tab.port,
        path: "/",
        method: "GET",
        headers: { Authorization: authHeader(tab) },
        timeout: 1000,
      },
      (res) => {
        res.resume();
        const statusCode = res.statusCode ?? 0;
        resolve(statusCode >= 200 && statusCode < 500 && statusCode !== 401 && statusCode !== 403);
      }
    );

    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.end();
  });
}

async function waitForTtydReady(tab: TerminalTab): Promise<boolean> {
  const deadline = Date.now() + TTYD_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (tab.process.exitCode !== null || tab.process.signalCode !== null || tab.process.killed) {
      return false;
    }
    if (await probeTtyd(tab)) return true;
    await delay(150);
  }
  return false;
}

async function createTerminalTab(title?: string): Promise<TerminalTab | null> {
  let port: number;
  try {
    port = await allocatePort();
  } catch (error) {
    vsgoLog("Terminal", "分配终端端口失败", { level: "error", detail: { error: String(error) } });
    return null;
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    reservedPorts.delete(port);
    return null;
  }

  const credential = createCredential();
  const proc = spawnTtyd(port, credential);
  const id = generateId("term");
  const tab: TerminalTab = {
    id,
    port,
    title: title || `终端 ${tabs.length + 1}`,
    process: proc,
    credential,
    status: "starting",
  };

  tabs.push(tab);
  activeTabId = tab.id;
  broadcastState();

  const ready = await waitForTtydReady(tab);
  if (!tabs.includes(tab)) return null;

  if (!ready) {
    vsgoLog("Terminal", `ttyd [${port}] 启动超时`, { level: "error" });
    closeTerminalTab(tab.id, { closeWindowIfLast: false });
    return null;
  }

  tab.status = "ready";
  broadcastState();
  return tab;
}

function ensureInitialTab(): void {
  if (tabs.length > 0 || pendingInitialTab) return;
  pendingInitialTab = createTerminalTab()
    .then(() => undefined)
    .finally(() => {
      pendingInitialTab = null;
    });
}

function closeTerminalTab(tabId: string, opts: { closeWindowIfLast?: boolean } = {}): void {
  const { closeWindowIfLast = true } = opts;
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return;
  stopTerminalProcess(tab);
  const idx = tabs.indexOf(tab);
  tabs.splice(idx, 1);
  if (activeTabId === tabId) {
    activeTabId = tabs.length > 0 ? tabs[tabs.length - 1].id : null;
  }
  broadcastState();
  if (closeWindowIfLast && tabs.length === 0 && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
}

function activateTerminalTab(tabId: string): void {
  if (!tabs.some((tab) => tab.id === tabId)) return;
  activeTabId = tabId;
  broadcastState();
}

function ensureAuthInterceptor(): void {
  if (authInterceptorRegistered) return;
  authInterceptorRegistered = true;
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ["http://127.0.0.1:*/*", "ws://127.0.0.1:*/*"] },
    (details, callback) => {
      const terminalWindowId = mainWindow?.isDestroyed() ? null : mainWindow?.webContents.id;
      const tab =
        terminalWindowId === details.webContentsId ? findTabByLocalUrl(details.url) : null;
      if (!tab) {
        callback({ cancel: false, requestHeaders: details.requestHeaders });
        return;
      }

      callback({
        cancel: false,
        requestHeaders: {
          ...details.requestHeaders,
          Authorization: authHeader(tab),
        },
      });
    }
  );
}

function registerIpc(): void {
  ipcMain.handle(TerminalEvent.GET_STATE, () => serializeState());

  ipcMain.on(TerminalEvent.NEW_TAB, () => {
    void createTerminalTab();
  });

  ipcMain.on(TerminalEvent.ACTIVATE_TAB, (_event, tabId: string) => {
    activateTerminalTab(tabId);
  });

  ipcMain.on(TerminalEvent.CLOSE_TAB, (_event, tabId: string) => {
    closeTerminalTab(tabId);
  });
}

function ensureIpc(): void {
  if (ipcRegistered) return;
  ipcRegistered = true;
  registerIpc();
}

function terminalRendererUrl(): string {
  const rendererUrl = process.env["ELECTRON_RENDERER_URL"]?.replace(/\/$/, "");
  return `${rendererUrl}/terminal.html#/terminal`;
}

function isTerminalRendererUrl(targetUrl: string): boolean {
  try {
    const url = new URL(targetUrl);
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      const rendererOrigin = new URL(process.env["ELECTRON_RENDERER_URL"]).origin;
      return url.origin === rendererOrigin && url.pathname.endsWith("/terminal.html");
    }
    return url.protocol === "file:" && url.pathname.endsWith("/terminal.html");
  } catch {
    return false;
  }
}

function createTerminalUiWindow(): BrowserWindow {
  ensureAuthInterceptor();

  const window = new BrowserWindow({
    width: 1000,
    height: 680,
    title: "终端",
    resizable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
    },
  });

  window.webContents.on("will-prevent-unload", (event) => {
    event.preventDefault();
  });
  window.on("closed", () => {
    closeAllTerminalTabs();
    if (mainWindow === window) mainWindow = null;
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isTerminalRendererUrl(targetUrl)) event.preventDefault();
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    window.loadURL(terminalRendererUrl());
  } else {
    window.loadFile(path.join(__dirname, "../renderer/terminal.html"), {
      hash: "/terminal",
    });
  }

  ensureIpc();
  return window;
}

export function createTerminalWindow(): BrowserWindow | null {
  resolvedTtydBin = resolveTtydBinary();
  if (!resolvedTtydBin) {
    showMissingTtydDialog();
    vsgoLog("Terminal", "未找到 ttyd", { level: "error" });
    return null;
  }

  const result = openManagedSubWindow(windowRef, {
    width: 1000,
    height: 680,
    title: "终端",
    hash: "",
    contextMenu: false,
    createWindow: createTerminalUiWindow,
    onReuse: (window) => {
      mainWindow = window;
      ensureIpc();
      ensureInitialTab();
      broadcastState();
    },
  });

  mainWindow = result;
  ensureInitialTab();
  broadcastState();

  return result;
}
