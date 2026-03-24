import { useState, useEffect, useCallback, useRef } from "react";
import { VS_GO_EVENT } from "../../common/EVENT";

const { ipcRenderer } = window.electron;

interface DisplayInfo {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  size: { width: number; height: number };
  scaleFactor: number;
  rotation: number;
  internal: boolean;
  brightness: number | null;
  brightnessSupported: boolean;
}

function DisplayManager() {
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    return () => {
      for (const timer of debounceTimers.current.values()) clearTimeout(timer);
    };
  }, []);

  const fetchDisplays = useCallback(async () => {
    setLoading(true);
    const res: DisplayInfo[] = await ipcRenderer.invoke(VS_GO_EVENT.DISPLAY_GET_ALL);
    setDisplays(res ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDisplays();
  }, [fetchDisplays]);

  const handleBrightnessChange = (displayId: number, value: number) => {
    setDisplays((prev) =>
      prev.map((d) => (d.id === displayId ? { ...d, brightness: value } : d)),
    );

    const existing = debounceTimers.current.get(displayId);
    if (existing) clearTimeout(existing);
    debounceTimers.current.set(
      displayId,
      setTimeout(() => {
        debounceTimers.current.delete(displayId);
        ipcRenderer.invoke(VS_GO_EVENT.DISPLAY_SET_BRIGHTNESS, displayId, value);
      }, 50),
    );
  };

  const primaryId = displays.find((d) => d.bounds.x === 0 && d.bounds.y === 0)?.id;

  return (
    <div className="p-6 w-full h-full flex flex-col bg-white dark:bg-gray-900 select-none">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="flex items-center gap-2">
          <span className="text-xl font-bold text-gray-800 dark:text-gray-100">屏幕管理</span>
        </h2>
        <button
          className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          onClick={fetchDisplays}
        >
          刷新
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">加载中...</div>
      ) : displays.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          未检测到显示器
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-4">
          <DisplayLayoutPreview displays={displays} primaryId={primaryId} />
          {displays.map((d) => (
            <DisplayCard
              key={d.id}
              display={d}
              isPrimary={d.id === primaryId}
              onBrightnessChange={handleBrightnessChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DisplayLayoutPreview({
  displays,
  primaryId,
}: {
  displays: DisplayInfo[];
  primaryId?: number;
}) {
  if (displays.length <= 1) return null;

  const minX = Math.min(...displays.map((d) => d.bounds.x));
  const minY = Math.min(...displays.map((d) => d.bounds.y));
  const maxX = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width));
  const maxY = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height));
  const totalW = maxX - minX;
  const totalH = maxY - minY;

  const containerW = 660;
  const scale = Math.min(containerW / totalW, 120 / totalH);
  const containerH = totalH * scale;

  return (
    <div className="mb-2 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">屏幕布局预览</p>
      <div className="relative mx-auto" style={{ width: containerW, height: containerH }}>
        {displays.map((d) => {
          const left = (d.bounds.x - minX) * scale;
          const top = (d.bounds.y - minY) * scale;
          const w = d.bounds.width * scale;
          const h = d.bounds.height * scale;
          const isPrimary = d.id === primaryId;

          return (
            <div
              key={d.id}
              className={`absolute rounded border-2 flex items-center justify-center text-xs font-medium transition-colors ${
                isPrimary
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                  : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300"
              }`}
              style={{ left, top, width: w, height: h }}
            >
              {isPrimary ? "主屏" : d.label || `#${d.id}`}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DisplayCard({
  display,
  isPrimary,
  onBrightnessChange,
}: {
  display: DisplayInfo;
  isPrimary: boolean;
  onBrightnessChange: (id: number, val: number) => void;
}) {
  const { id, label, bounds, size, scaleFactor, rotation, internal, brightness, brightnessSupported } = display;

  return (
    <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base font-semibold text-gray-800 dark:text-gray-100">
          {label || `Display ${id}`}
        </span>
        {isPrimary && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
            主屏
          </span>
        )}
        {internal && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400">
            内置
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600 dark:text-gray-400 mb-4">
        <div>
          分辨率: {size.width} x {size.height}
        </div>
        <div>缩放: {scaleFactor}x</div>
        <div>
          位置: ({bounds.x}, {bounds.y})
        </div>
        {rotation !== 0 && <div>旋转: {rotation}°</div>}
      </div>

      {brightnessSupported ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400 w-10 shrink-0">亮度</span>
            <SunIcon className="w-4 h-4 text-gray-400" dim />
            <input
              type="range"
              min={1}
              max={100}
              value={brightness ?? 50}
              onChange={(e) => onBrightnessChange(id, Number(e.target.value))}
              className="flex-1 h-2 rounded-full appearance-none cursor-pointer accent-blue-500 bg-gray-200 dark:bg-gray-600"
            />
            <SunIcon className="w-5 h-5 text-yellow-500" />
            <span className="text-sm text-gray-600 dark:text-gray-300 w-10 text-right tabular-nums">
              {brightness != null ? `${brightness}%` : "--"}
            </span>
          </div>
          {brightness == null && (
            <div className="text-xs text-gray-400 dark:text-gray-500">
              当前亮度值读取失败，但仍可尝试拖动调节。
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-gray-400 dark:text-gray-500 italic">
          此显示器不支持亮度调节
        </div>
      )}
    </div>
  );
}

function SunIcon({ className, dim }: { className?: string; dim?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r={dim ? 4 : 5} />
      {!dim && (
        <>
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </>
      )}
    </svg>
  );
}

export default DisplayManager;
