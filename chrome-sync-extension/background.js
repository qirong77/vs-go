// ============================================================
// VsGo Cookie & Storage Sync - background service worker
// 读取 Chrome 全部 cookies + 已打开页面的 localStorage，
// 定时 / 事件驱动 / 手动触发，POST 到 VsGo 本地同步服务。
// ============================================================

const DEFAULT_SYNC_URL = "http://127.0.0.1:18765/sync";
const SETTINGS_KEY = "vsgoSyncSettings";

// 数据采集上限，避免 payload 过大
const MAX_KEYS_PER_ORIGIN = 500;
const MAX_VALUE_LENGTH = 65536;

// ============================================================
// 设置
// ============================================================

async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const cfg = stored[SETTINGS_KEY] || {};
  return {
    enabled: cfg.enabled !== false,
    syncUrl: cfg.syncUrl || DEFAULT_SYNC_URL,
    intervalMin: Number(cfg.intervalMin) || 1,
  };
}

// ============================================================
// 采集
// ============================================================

async function collectCookies() {
  return chrome.cookies.getAll({});
}

/** 遍历所有 http/https 标签页，读取各 origin 的 localStorage */
async function collectLocalStorage() {
  const results = {};
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    const url = tab.url || "";
    if (!/^https?:\/\//.test(url)) continue;
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const data = {};
          for (let i = 0; i < localStorage.length; i++) {
            if (Object.keys(data).length >= 500) break;
            const k = localStorage.key(i);
            if (k == null) continue;
            let v = localStorage.getItem(k);
            if (v == null) continue;
            if (v.length > 65536) v = v.slice(0, 65536) + "__TRUNCATED__";
            data[k] = v;
          }
          return { origin: location.origin, data };
        },
      });
      const r = res && res.result;
      if (r && r.origin && r.data) {
        results[r.origin] = r.data;
      }
    } catch (e) {
      // 无权限的页面（chrome:// 等）会抛错，跳过
      console.warn("[VsGo Sync] 无法读取 tab", tab.id, url, e);
    }
  }
  return results;
}

// ============================================================
// 同步
// ============================================================

async function syncNow(manual = false) {
  const settings = await getSettings();
  if (!settings.enabled && !manual) {
    return { ok: false, reason: "disabled" };
  }

  const startedAt = Date.now();
  try {
    const cookies = await collectCookies();
    const localStorage = await collectLocalStorage();
    const payload = {
      source: "chrome-extension",
      version: 1,
      timestamp: Date.now(),
      cookies,
      localStorage,
    };

    const resp = await fetch(settings.syncUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }

    const status = {
      time: Date.now(),
      ok: resp.ok,
      status: resp.status,
      body,
      cookieCount: cookies.length,
      lsOrigins: Object.keys(localStorage).length,
      durationMs: Date.now() - startedAt,
    };
    await chrome.storage.local.set({ vsgoLastSync: status });
    return { ok: resp.ok, status: resp.status, body };
  } catch (e) {
    const status = {
      time: Date.now(),
      ok: false,
      error: String(e && e.message ? e.message : e),
      durationMs: Date.now() - startedAt,
    };
    await chrome.storage.local.set({ vsgoLastSync: status });
    return { ok: false, error: status.error };
  }
}

// ============================================================
// 事件驱动：cookie 变化 / 页面加载完成 → 去抖同步
// ============================================================

let pendingTimer = null;
function scheduleSync(delayMs = 3000) {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    syncNow(false);
  }, delayMs);
}

chrome.cookies.onChanged.addListener(() => scheduleSync());

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.status === "complete") scheduleSync();
});

// 定时兜底同步（事件驱动为主，5 分钟兜底一次）
chrome.alarms.create("vsgo-sync", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "vsgo-sync") syncNow(false);
});

// 启动时同步一次
syncNow(false);

// ============================================================
// 消息：popup 触发立即同步 / 查询状态 / 更新设置
// ============================================================

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "sync-now") {
    syncNow(true).then((r) => sendResponse(r));
    return true; // 异步响应
  }
  if (msg && msg.type === "get-status") {
    chrome.storage.local.get(["vsgoLastSync", SETTINGS_KEY]).then((data) => {
      sendResponse({
        lastSync: data.vsgoLastSync || null,
        settings: data[SETTINGS_KEY] || {},
      });
    });
    return true;
  }
  if (msg && msg.type === "update-settings") {
    chrome.storage.local.set({ [SETTINGS_KEY]: msg.settings }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
  return false;
});
