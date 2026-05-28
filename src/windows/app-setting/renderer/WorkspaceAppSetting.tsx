import { useState, useEffect, useCallback } from "react";
import { AppEvent } from "@windows/app-setting/events";

const { ipcRenderer } = window.electron;

interface AppItem {
  displayName: string;
  bundleName: string;
  installed: boolean;
  running: boolean;
  isDefault: boolean;
}

function StatusBadge({ installed, running }: { installed: boolean; running: boolean }) {
  if (!installed) {
    return (
      <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
        未安装
      </span>
    );
  }
  return running ? (
    <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">运行中</span>
  ) : (
    <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">未运行</span>
  );
}

function AppRow({
  app,
  onRemove,
}: {
  app: AppItem;
  onRemove?: (bundleName: string) => void;
}) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg ${!app.isDefault ? "group" : ""}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700">{app.displayName}</span>
        <span className="text-xs text-gray-400">{app.bundleName}</span>
      </div>
      <div className="flex items-center gap-3">
        <StatusBadge installed={app.installed} running={app.running} />
        {onRemove && !app.isDefault && (
          <button
            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-all"
            onClick={() => onRemove(app.bundleName)}
            title="移除"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V4a1 1 0 011-1h6a1 1 0 011 1v3"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export default function WorkspaceAppSetting() {
  const [defaultApps, setDefaultApps] = useState<AppItem[]>([]);
  const [userApps, setUserApps] = useState<AppItem[]>([]);
  const [checking, setChecking] = useState(false);

  const loadApps = useCallback(async () => {
    const res = await ipcRenderer.invoke(AppEvent.WORKSPACE_APPS_GET);
    if (res?.defaults) setDefaultApps(res.defaults);
    if (res?.user) setUserApps(res.user);
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const handleAdd = async () => {
    const res = await ipcRenderer.invoke(AppEvent.WORKSPACE_APP_SELECT);
    if (res.canceled || !res.displayName) return;

    const exists = userApps.some((a) => a.bundleName === res.bundleName);
    if (exists) return;

    await ipcRenderer.invoke(AppEvent.WORKSPACE_APPS_ADD, {
      displayName: res.displayName,
      bundleName: res.bundleName,
    });
    loadApps();
  };

  const handleRemove = async (bundleName: string) => {
    await ipcRenderer.invoke(AppEvent.WORKSPACE_APPS_REMOVE, bundleName);
    loadApps();
  };

  const handleCheckNow = async () => {
    setChecking(true);
    await ipcRenderer.invoke(AppEvent.WORKSPACE_APPS_CHECK_NOW);
    await loadApps();
    setChecking(false);
  };

  return (
    <div className="p-6 w-full h-full flex flex-col bg-white">
      <h2 className="mb-6 flex items-center gap-2">
        <span className="text-xl" role="img" aria-label="apps">
          💻
        </span>
        <span className="text-xl font-bold text-gray-800">工作区 App</span>
      </h2>

      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">
          每隔 15 分钟自动检测并启动已配置的 App，确保工作区应用保持运行。
        </p>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-60 shrink-0"
          onClick={handleCheckNow}
          disabled={checking}
        >
          <svg
            className={`w-4 h-4 ${checking ? "animate-spin" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {checking ? "检测中..." : "立即检测"}
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            默认 App
          </h3>
          <div className="space-y-2">
            {defaultApps.map((app) => (
              <AppRow key={app.bundleName} app={app} />
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              我的 App
            </h3>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              onClick={handleAdd}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              添加
            </button>
          </div>

          {userApps.length === 0 ? (
            <div className="text-sm text-gray-400 py-8 text-center bg-gray-50 rounded-lg">
              暂无自定义 App，点击右上角"添加"
            </div>
          ) : (
            <div className="space-y-2">
              {userApps.map((app) => (
                <AppRow key={app.bundleName} app={app} onRemove={handleRemove} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
