// VsGo 同步 popup：展示上次同步状态、手动同步、开关与地址配置

const statusEl = document.getElementById("status");
const syncBtn = document.getElementById("syncBtn");
const enabledEl = document.getElementById("enabled");
const syncUrlEl = document.getElementById("syncUrl");

function fmtTime(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("zh-CN");
}

function renderStatus(status) {
  if (!status) {
    statusEl.innerHTML = '尚未同步。<span style="color:#86909c">点击「立即同步」或等待自动同步。</span>';
    return;
  }
  if (status.ok) {
    const body = status.body || {};
    statusEl.innerHTML =
      `<div class="ok">✓ 同步成功（${status.durationMs}ms）</div>` +
      `时间：${fmtTime(status.time)}<br/>` +
      `Cookie：${status.cookieCount ?? "-"} 条，localStorage：${status.lsOrigins ?? "-"} 个站点<br/>` +
      `服务端应用：Cookie ${body.cookieApplied ?? "-"}/${body.cookieFailed ?? "-"} 失败，本地 ${body.localStorageOrigins ?? "-"} 个站点`;
  } else {
    statusEl.innerHTML =
      `<div class="fail">✗ 同步失败 ${status.status ? "HTTP " + status.status : ""}</div>` +
      `时间：${fmtTime(status.time)}<br/>` +
      `错误：${status.error || (status.body ? JSON.stringify(status.body) : "-")}`;
  }
}

async function refresh() {
  const resp = await chrome.runtime.sendMessage({ type: "get-status" });
  renderStatus(resp.lastSync);
  if (resp.settings) {
    enabledEl.checked = resp.settings.enabled !== false;
    syncUrlEl.value = resp.settings.syncUrl || "http://127.0.0.1:18765/sync";
  }
}

syncBtn.addEventListener("click", async () => {
  syncBtn.disabled = true;
  syncBtn.textContent = "同步中…";
  try {
    const r = await chrome.runtime.sendMessage({ type: "sync-now" });
    if (r && r.ok) {
      statusEl.innerHTML = '<div class="ok">✓ 手动同步成功</div>';
    } else {
      statusEl.innerHTML =
        `<div class="fail">✗ 同步失败 ${r && r.status ? "HTTP " + r.status : ""}</div>` +
        `错误：${(r && r.error) || (r && r.body ? JSON.stringify(r.body) : "-")}`;
    }
  } finally {
    syncBtn.disabled = false;
    syncBtn.textContent = "立即同步";
    refresh();
  }
});

enabledEl.addEventListener("change", () => {
  chrome.runtime.sendMessage({
    type: "update-settings",
    settings: { enabled: enabledEl.checked, syncUrl: syncUrlEl.value || undefined },
  });
});

syncUrlEl.addEventListener("change", () => {
  chrome.runtime.sendMessage({
    type: "update-settings",
    settings: { enabled: enabledEl.checked, syncUrl: syncUrlEl.value.trim() || undefined },
  });
});

refresh();
