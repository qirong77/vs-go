import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Input,
  InputNumber,
  Modal,
  Progress,
  Segmented,
  Switch,
  Table,
  Tag,
  Tooltip,
} from "antd";
import type { TableProps } from "antd";
import { GcEvent } from "@windows/gc/events";
import { normalizeGcSettings } from "@windows/gc/settings";
import type {
  GcCpuInfo,
  GcProcessInfo,
  GcProcessTag,
  GcSettings,
  GcSnapshot,
} from "@windows/gc/types";

const { ipcRenderer } = window.electron;

const TAG_META: Record<GcProcessTag, { label: string; color: string; hex: string }> = {
  "orphan-helper": { label: "孤儿 helper", color: "magenta", hex: "#eb2f96" },
  "orphan-descendant": { label: "深层残留", color: "purple", hex: "#722ed1" },
  zombie: { label: "僵尸进程", color: "default", hex: "#8c8c8c" },
  "high-cpu": { label: "高CPU", color: "volcano", hex: "#fa541c" },
  "high-mem": { label: "高内存", color: "orange", hex: "#fa8c16" },
  protected: { label: "保护", color: "blue", hex: "#1677ff" },
  system: { label: "系统", color: "default", hex: "#6b7280" },
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN", { hour12: false });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : String(error);
}

function SettingNumber({
  value,
  min,
  max,
  step,
  unit,
  onSave,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onSave: (value: number) => Promise<boolean>;
}): React.JSX.Element {
  const [draft, setDraft] = useState<number | null>(value);
  const [saving, setSaving] = useState(false);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  return (
    <InputNumber<number>
      min={min}
      max={max}
      step={step}
      value={draft}
      disabled={saving}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={setDraft}
      onPressEnter={(event) => event.currentTarget.blur()}
      onBlur={() => {
        focused.current = false;
        if (draft === null) {
          setDraft(value);
          return;
        }
        if (draft === value) return;
        setSaving(true);
        void onSave(draft)
          .then((saved) => {
            if (!saved) setDraft(value);
          })
          .finally(() => setSaving(false));
      }}
      addonAfter={unit}
    />
  );
}

function MemoryBar({ memory }: { memory: GcSnapshot["memory"] }): React.JSX.Element {
  // 压力等级 → 展示颜色；无压力等级时按占用率兜底。
  const pressureColor =
    memory.pressure === 2
      ? "#f5222d"
      : memory.pressure === 1
        ? "#fa8c16"
        : memory.usedPercent > 85
          ? "#f5222d"
          : memory.usedPercent > 70
            ? "#fa8c16"
            : "#1a73e8";
  return (
    <div style={{ minWidth: 260 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: "#6b7280", fontSize: 12 }}>
          内存 {memory.usedMB} / {memory.totalMB} MB · 可用 {memory.availableMB} MB
        </span>
        <span style={{ color: pressureColor, fontSize: 12, fontWeight: 600 }}>
          {memory.usedPercent}%
        </span>
      </div>
      <Progress
        percent={memory.usedPercent}
        strokeColor={pressureColor}
        size="small"
      />
    </div>
  );
}

function tagCells(tags: GcProcessTag[]): React.JSX.Element[] {
  return tags.map((t) => {
    const meta = TAG_META[t];
    return (
      <Tag key={t} color={meta.color}>
        {meta.label}
      </Tag>
    );
  });
}

function CpuBar({ cpu }: { cpu: GcCpuInfo }): React.JSX.Element {
  const color = cpu.usedPercent > 85 ? "#f5222d" : "#1a73e8";
  return (
    <div style={{ minWidth: 240 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: "#6b7280", fontSize: 12 }}>CPU 占用</span>
        <span style={{ color: "#1a73e8", fontSize: 12, fontWeight: 600 }}>{cpu.usedPercent}%</span>
      </div>
      <Progress percent={cpu.usedPercent} strokeColor={color} size="small" />
      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
        {cpu.userPercent.toFixed(1)}% user · {cpu.sysPercent.toFixed(1)}% sys ·{" "}
        {cpu.idlePercent.toFixed(1)}% idle · {cpu.coreCount} 核
      </div>
    </div>
  );
}

const SYSTEM_PROCESS_DESC: Record<string, string> = {
  launchd: "系统启动守护进程，管理所有系统与登录项进程",
  logd: "系统日志守护进程，统一存储与转发系统日志",
  smd: "系统管理守护进程（System Management Daemon）",
  UserEventAgent: "用户事件代理，处理登录项与用户级事件",
  fseventsd: "文件系统事件守护进程，为索引与备份提供变更通知",
  mediaremoted: "媒体远程守护进程，处理 AirPlay 等远程控制",
  systemstats: "系统统计守护进程，采集硬件与系统状态",
  configd: "网络与系统配置守护进程，管理网络/DNS 等",
  powerd: "电源管理守护进程，负责电量与睡眠策略",
  IOMFB_bics_daemon: "显示引擎守护进程，处理色彩与显示管线",
  corespeechd_system: "系统语音识别守护进程（Core Speech）",
  watchdogd: "看门狗守护进程，监控系统组件响应",
  mds: "Spotlight 索引守护进程，维护文件元数据索引",
  mdworker: "Spotlight 索引进程，更新文件内容索引",
  kernelmanagerd: "内核扩展管理守护进程",
  WindowServer: "窗口服务器，负责所有图形界面绘制",
  syslogd: "系统日志记录进程",
  securityd: "安全与钥匙串守护进程",
  notifyd: "系统通知分发进程",
  cfprefsd: "偏好设置守护进程，管理应用配置缓存",
  opendirectoryd: "目录服务数据守护进程",
  coreaudiod: "音频服务守护进程",
  bluetoothd: "蓝牙设备服务守护进程",
  nsurlsessiond: "网络请求会话守护进程（URLSession）",
  tccd: "隐私权限（TCC）守护进程",
  diskarbitrationd: "磁盘挂载/仲裁守护进程",
  thermalmonitord: "温度与散热监控守护进程",
  cloudd: "iCloud 云服务守护进程",
  hangtracerd: "系统卡顿轨迹采集进程",
  ReportCrash: "崩溃报告采集进程",
  syspolicyd: "系统安全策略守护进程",
  storeassetd: "App Store 资产守护进程",
};

function describeProcess(p: GcProcessInfo): string {
  const name = p.name;
  const desc = SYSTEM_PROCESS_DESC[name];
  if (desc) return desc;
  const pathLower = p.path.toLowerCase();
  const bundle = /\/[^/]+\.app\//.exec(p.path)?.[0];
  if (bundle) {
    const app = bundle.replace(/^\//, "").replace(/\.app\/$/, "").replace(/^.*\//, "");
    return `${app} 应用`;
  }
  if (/helper/i.test(name) || /helper/i.test(pathLower)) return "应用辅助进程（Helper）";
  if (pathLower.includes("/opt/didi/")) return "滴滴内部组件";
  if (
    pathLower.startsWith("/system/") ||
    pathLower.startsWith("/usr/libexec") ||
    pathLower.startsWith("/usr/sbin") ||
    pathLower.startsWith("/sbin")
  )
    return "系统守护进程";
  if (/^node(\.exe)?$/.test(name)) return "Node.js 运行时进程";
  if (/^python/.test(name)) return "Python 脚本进程";
  if (/^java\b/.test(name)) return "Java 虚拟机进程";
  if (/^ruby/.test(name)) return "Ruby 脚本进程";
  return "";
}

// macOS/Linux ps 进程状态码含义。首字母为运行状态，小写后缀为附加属性。
const STATE_CODE_META: Record<string, { label: string; color: string }> = {
  R: { label: "运行中", color: "#52c41a" },
  S: { label: "休眠中", color: "#faad14" },
  I: { label: "空闲", color: "#8c8c8c" },
  D: { label: "不可中断等待", color: "#f5222d" },
  U: { label: "不可中断等待", color: "#f5222d" },
  T: { label: "已暂停", color: "#fa541c" },
  Z: { label: "僵尸进程", color: "#8c8c8c" },
  W: { label: "换出中", color: "#722ed1" },
  X: { label: "内存增长中", color: "#722ed1" },
  E: { label: "退出中", color: "#fa541c" },
  "?": { label: "状态不可用", color: "#8c8c8c" },
};

const STATE_FLAG_META: Record<string, string> = {
  s: "会话领导者",
  "+": "前台进程组",
  l: "多线程",
  "<": "高优先级",
  N: "低优先级",
};

function parseState(state: string): {
  letter: string;
  base?: { label: string; color: string };
  flags: string[];
} {
  const trimmed = state.trim();
  const letter = trimmed.charAt(0).toUpperCase();
  const flags = trimmed
    .slice(1)
    .split("")
    .filter((ch) => STATE_FLAG_META[ch]);
  return { letter, base: STATE_CODE_META[letter], flags };
}

function stateCell(state: string): React.JSX.Element {
  const { letter, base, flags } = parseState(state);
  if (!base) {
    return (
      <span style={{ color: "#202124", fontFamily: "monospace", fontSize: 12 }}>{state}</span>
    );
  }
  const flagLabels = flags.map((f) => STATE_FLAG_META[f]);
  const hint = [base.label, ...flagLabels].join(" · ");
  const detailParts = [`运行状态：${base.label}`];
  if (flagLabels.length) detailParts.push(`附加属性：${flagLabels.join("、")}`);
  return (
    <Tooltip
      title={
        <div style={{ fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{hint}</div>
          {detailParts.map((part) => (
            <div key={part} style={{ color: "rgba(255,255,255,0.85)" }}>
              {part}
            </div>
          ))}
        </div>
      }
    >
      <span
        style={{
          color: base.color,
          fontFamily: "monospace",
          fontSize: 12,
          fontWeight: 600,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: base.color,
            display: "inline-block",
          }}
        />
        {letter}
        {flags.map((f) => (
          <span key={f} style={{ color: "#9ca3af", fontWeight: 400 }}>
            {f}
          </span>
        ))}
      </span>
    </Tooltip>
  );
}

function GcWindow(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<GcSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [tab, setTab] = useState<"process" | "log" | "settings">("process");
  const [tagFilter, setTagFilter] = useState<Set<GcProcessTag>>(new Set());
  const [protectInput, setProtectInput] = useState("");
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const refreshPromise = useRef<Promise<void> | null>(null);
  const refreshQueued = useRef(false);
  const mounted = useRef(false);

  const refresh = useCallback((): Promise<void> => {
    if (refreshPromise.current) {
      refreshQueued.current = true;
      return refreshPromise.current;
    }
    setLoading(true);
    const request = (async () => {
      try {
        do {
          refreshQueued.current = false;
          try {
            const snap = (await ipcRenderer.invoke(GcEvent.SNAPSHOT)) as GcSnapshot | null;
            if (!snap) throw new Error("未能获取进程快照，请重试或查看主进程日志。");
            if (mounted.current && !refreshQueued.current) {
              setSnapshot(snap);
              setRefreshError(null);
            }
          } catch (error) {
            if (mounted.current) setRefreshError(errorMessage(error));
          }
        } while (
          mounted.current &&
          refreshQueued.current &&
          document.visibilityState === "visible"
        );
      } finally {
        refreshPromise.current = null;
        if (mounted.current) setLoading(false);
      }
    })();
    refreshPromise.current = request;
    return request;
  }, []);

  useEffect(() => {
    mounted.current = true;
    const onPush = (): void => {
      if (document.visibilityState === "visible") void refresh();
    };
    onPush();
    const timer = window.setInterval(() => {
      if (!refreshPromise.current) onPush();
    }, 180000);
    document.addEventListener("visibilitychange", onPush);
    ipcRenderer.on(GcEvent.PUSH, onPush);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onPush);
      ipcRenderer.removeListener(GcEvent.PUSH, onPush);
    };
  }, [refresh]);

  const settings = snapshot?.settings;
  const memory = snapshot?.memory;

  const processes = useMemo(() => {
    if (!snapshot) return [];
    const list =
      tagFilter.size === 0
        ? snapshot.processes
        : snapshot.processes.filter((p) => p.tags.some((t) => tagFilter.has(t)));
    // 默认按 CPU（60%）与内存（40%）归一化加权排序，高占用排前；点列头可临时覆盖。
    const maxCpu = Math.max(...list.map((p) => p.cpu), 1);
    const maxMem = Math.max(...list.map((p) => p.rssMB), 1);
    const score = (p: GcProcessInfo): number => (p.cpu / maxCpu) * 0.6 + (p.rssMB / maxMem) * 0.4;
    return [...list].sort((a, b) => score(b) - score(a));
  }, [snapshot, tagFilter]);

  const garbage = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.processes.filter(
      (p) =>
        (p.tags.includes("orphan-helper") || p.tags.includes("orphan-descendant")) &&
        !p.tags.some((tag) => tag === "protected" || tag === "system" || tag === "zombie")
    );
  }, [snapshot]);

  const garbageMB = useMemo(() => garbage.reduce((sum, p) => sum + p.rssMB, 0), [garbage]);

  const highRisk = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.processes.filter(
      (p) => p.tags.includes("high-cpu") || p.tags.includes("high-mem")
    );
  }, [snapshot]);

  const lastClean = snapshot?.lastCleanResult;

  const toggleTag = (tag: GcProcessTag): void => {
    setTagFilter((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const handleCleanNow = async (mode: "standard" | "deep"): Promise<void> => {
    setCleaning(true);
    setActionError(null);
    try {
      const result = (await ipcRenderer.invoke(
        GcEvent.CLEAN_NOW,
        mode
      )) as GcSnapshot["lastCleanResult"];
      if (!result) throw new Error("清理未返回执行结果，请刷新后查看状态。");
      const content = (
        <div>
          <p>
            已终止 {result.killed.length} 个进程，终止前 RSS 合计 {result.freedMB} MB。
          </p>
          <p>
            仍在观察期：{result.pendingCount} 个；跳过：{result.skipped.length} 个。
          </p>
          {result.skipped.length > 0 && (
            <p>
              {result.skipped
                .map((item) => `${item.name} (${item.pid})：${item.reason}`)
                .join("；")}
            </p>
          )}
          {result.error && <p style={{ color: "#cf1322" }}>{result.error}</p>}
        </div>
      );
      if (result.error) {
        setActionError(result.error);
        Modal.error({ title: "清理出现异常", content });
      } else {
        Modal.info({ title: `${mode === "deep" ? "深度" : "普通"}清理结果`, content });
      }
      await refresh();
    } catch (error) {
      setActionError(errorMessage(error));
      Modal.error({ title: "清理失败", content: errorMessage(error) });
    } finally {
      setCleaning(false);
    }
  };

  const handleKill = ({ pid, name, startedAt }: GcProcessInfo): void => {
    Modal.confirm({
      title: `终止进程 ${name}?`,
      content: "终止可能导致该程序未保存的工作丢失。执行前会复核进程身份与保护规则。",
      okText: "终止",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        setActionError(null);
        try {
          const result = (await ipcRenderer.invoke(GcEvent.KILL_PROCESS, pid, startedAt)) as {
            killed: boolean;
            reason?: string;
            error?: string;
          } | null;
          if (!result?.killed)
            throw new Error(result?.reason || result?.error || "进程未终止，主进程未返回原因。");
          await refresh();
        } catch (error) {
          setActionError(errorMessage(error));
          Modal.error({ title: "终止失败", content: errorMessage(error) });
          throw error;
        }
      },
    });
  };

  const handleSettingsSave = async (patch: Partial<GcSettings>): Promise<boolean> => {
    setActionError(null);
    try {
      normalizeGcSettings(patch);
      await ipcRenderer.invoke(GcEvent.SETTINGS_SET, patch);
      await refresh();
      return true;
    } catch (error) {
      setActionError(`设置保存失败：${errorMessage(error)}`);
      return false;
    }
  };

  const handleProtectAdd = async (): Promise<void> => {
    const value = protectInput.trim();
    if (!value) return;
    setActionError(null);
    try {
      await ipcRenderer.invoke(GcEvent.PROTECT_ADD, value);
      setProtectInput((current) => (current.trim() === value ? "" : current));
      await refresh();
    } catch (error) {
      setActionError(`添加保护失败：${errorMessage(error)}`);
    }
  };

  const handleProtectRemove = async (value: string): Promise<void> => {
    setActionError(null);
    try {
      await ipcRenderer.invoke(GcEvent.PROTECT_REMOVE, value);
      await refresh();
    } catch (error) {
      setActionError(`移除保护失败：${errorMessage(error)}`);
    }
  };

  const handleClearLog = async (): Promise<void> => {
    setActionError(null);
    try {
      await ipcRenderer.invoke(GcEvent.CLEAR_LOG);
      await refresh();
    } catch (error) {
      setActionError(`清空日志失败：${errorMessage(error)}`);
    }
  };

  const cols: TableProps<GcProcessInfo>["columns"] = [
    {
      title: "PID",
      dataIndex: "pid",
      width: 70,
      render: (v: number) => <span style={{ color: "#6b7280" }}>{v}</span>,
    },
    {
      title: "名称",
      dataIndex: "name",
      width: 200,
      render: (v: string, r: GcProcessInfo) => {
        const desc = describeProcess(r);
        return (
          <div>
            <div
              title={r.path}
              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {v}
            </div>
            {desc && (
              <div
                style={{
                  fontSize: 11,
                  color: "#9ca3af",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {desc}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: (
        <Tooltip title="CPU 占用为「相对单个核心」的百分比；多核机器上进程可超过 100%（如 200% 表示占满 2 个核）">
          <span>CPU %</span>
        </Tooltip>
      ),
      dataIndex: "cpu",
      width: 90,
      sorter: (a: GcProcessInfo, b: GcProcessInfo) => a.cpu - b.cpu,
      render: (v: number) => {
        const cores = snapshot?.cpu.coreCount ?? 1;
        const high = v >= (settings?.cpuHighThreshold ?? 80);
        // 超过 100% 说明进程占用了多个核，换算成「≈N 核」更直观。
        const multiCore = v > 100 ? `≈${(v / 100).toFixed(1)}核` : null;
        return (
          <Tooltip title={`相对单核 ${v.toFixed(1)}%（核数 ${cores}）`}>
            <span style={{ color: high ? "#f5222d" : "#202124" }}>
              {v.toFixed(1)}
              {multiCore && (
                <span style={{ color: "#9ca3af", fontSize: 11, marginLeft: 4 }}>{multiCore}</span>
              )}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: "内存 MB",
      dataIndex: "rssMB",
      width: 100,
      sorter: (a: GcProcessInfo, b: GcProcessInfo) => a.rssMB - b.rssMB,
      render: (v: number) => (
        <span style={{ color: v >= (settings?.memHighThresholdMB ?? 500) ? "#f5222d" : "#202124" }}>
          {v}
        </span>
      ),
    },
    {
      title: (
        <Tooltip title="进程状态：首字母为运行状态，小写为附加属性。如 Rs = 运行中 · 会话领导者">
          <span>状态</span>
        </Tooltip>
      ),
      dataIndex: "state",
      width: 90,
      render: (v: string) => stateCell(v),
    },
    {
      title: "标签",
      dataIndex: "tags",
      render: (tags: GcProcessTag[], process: GcProcessInfo) => (
        <div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{tagCells(tags)}</div>
          {process.cleanupReason && (
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              {process.cleanupReason}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "操作",
      key: "action",
      width: 90,
      render: (_: unknown, r: GcProcessInfo) => {
        const blocked =
          r.tags.some((tag) => tag === "protected" || tag === "system" || tag === "zombie") ||
          r.pid === 0;
        return (
          <Button
            size="small"
            danger
            disabled={blocked || cleaning || snapshot?.running}
            onClick={() => handleKill(r)}
          >
            终止
          </Button>
        );
      },
    },
  ];

  const logRows = snapshot?.logEntries ?? [];

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        background: "#f5f6f7",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 头部 */}
      <div
        style={{ padding: "16px 20px", background: "#ffffff", borderBottom: "1px solid #e5e7eb" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: "#202124" }}>系统 GC</span>
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              启用于 {snapshot ? formatTime(snapshot.bootAt) : "..."}
            </span>
          </div>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start" }}>
            {memory && <MemoryBar memory={memory} />}
            {snapshot?.cpu && <CpuBar cpu={snapshot.cpu} />}
          </div>
          <div style={{ flex: 1 }} />
          <Button
            disabled={cleaning || snapshot?.running || !snapshot}
            onClick={() => void handleCleanNow("standard")}
          >
            普通清理
          </Button>
          <Button
            type="primary"
            loading={cleaning}
            disabled={snapshot?.running || !snapshot}
            onClick={() => void handleCleanNow("deep")}
          >
            深度清理
          </Button>
          <Button onClick={() => void refresh()} loading={loading}>
            刷新
          </Button>
        </div>

        <div
          style={{
            marginTop: 12,
            padding: "8px 14px",
            background: "#fafafa",
            border: "1px solid #f0f0f0",
            borderRadius: 8,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            rowGap: 4,
            gap: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>清理候选</span>
            <b style={{ color: garbage.length > 0 ? "#eb2f96" : "#202124", fontSize: 14 }}>
              {snapshot ? garbage.length : "—"}
            </b>
            <span style={{ fontSize: 13, color: "#6b7280" }}>个（含深层残留）</span>
            {garbageMB > 0 && (
              <span style={{ fontSize: 12, color: "#1a73e8" }}>{garbageMB.toFixed(1)} MB</span>
            )}
          </div>
          <div style={{ width: 1, height: 16, background: "#e5e7eb", margin: "0 16px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>高消耗进程</span>
            <b style={{ color: highRisk.length > 0 ? "#fa8c16" : "#202124", fontSize: 14 }}>
              {snapshot ? highRisk.length : "—"}
            </b>
            <span style={{ fontSize: 13, color: "#6b7280" }}>个（仅提示）</span>
          </div>
          <div style={{ width: 1, height: 16, background: "#e5e7eb", margin: "0 16px" }} />
          {snapshot?.running && <Tag color="processing">清理中...</Tag>}
          {snapshot && (
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              下次自动检查：
              {snapshot.nextRunAt
                ? formatTime(snapshot.nextRunAt)
                : settings?.autoClean
                  ? "等待调度"
                  : "已关闭"}
            </span>
          )}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
          普通清理检查孤儿 helper；深度清理还检查同一应用的残留 helper 子进程。执行前会复核候选。
        </div>
        {refreshError && (
          <Alert
            style={{ marginTop: 10 }}
            type="error"
            showIcon
            message={`刷新失败：${refreshError}`}
            description={
              snapshot
                ? "以下为上一次成功获取的数据，可能已过时。"
                : "尚未获取到进程数据，请点击刷新重试。"
            }
          />
        )}
        {actionError && (
          <Alert
            style={{ marginTop: 10 }}
            type="error"
            showIcon
            message={actionError}
            closable
            onClose={() => setActionError(null)}
          />
        )}

        {lastClean && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 12px",
              background: "#f0f5ff",
              borderRadius: 6,
              fontSize: 12,
              color: "#37517e",
            }}
          >
            {formatTime(lastClean.at)} · {lastClean.source === "auto" ? "自动" : "手动"}
            {lastClean.mode === "deep" ? "深度" : "普通"}清理：终止 {lastClean.killed.length}{" "}
            个进程，终止前 RSS 合计 {lastClean.freedMB} MB ；观察中 {lastClean.pendingCount} 个
            {lastClean.error && (
              <span style={{ color: "#cf1322" }}>（异常：{lastClean.error}）</span>
            )}
          </div>
        )}
      </div>

      {/* 标签栏 */}
      <div
        style={{ padding: "10px 20px 10px", background: "#ffffff", borderBottom: "1px solid #e5e7eb" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <Segmented
            value={tab}
            onChange={(v) => setTab(v as typeof tab)}
            options={[
              { label: `进程 (${snapshot?.processes.length ?? "—"})`, value: "process" },
              { label: `清理日志 (${snapshot ? logRows.length : "—"})`, value: "log" },
              { label: "设置", value: "settings" },
            ]}
          />
          {tab === "process" && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#6b7280", marginRight: 2 }}>筛选：</span>
              {(Object.keys(TAG_META) as GcProcessTag[]).map((t) => {
                const meta = TAG_META[t];
                const active = tagFilter.has(t);
                return (
                  <Tag
                    key={t}
                    color={active ? meta.color : undefined}
                    style={{
                      cursor: "pointer",
                      padding: "2px 10px",
                      ...(active
                        ? {}
                        : { color: meta.hex, borderColor: meta.hex, background: `${meta.hex}14` }),
                    }}
                    onClick={() => toggleTag(t)}
                  >
                    {meta.label}
                  </Tag>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 内容 */}
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {tab === "process" && (
          <div>
            <Table
              rowKey={(process) => `${process.pid}:${process.startedAt}`}
              size="small"
              loading={loading}
              columns={cols}
              dataSource={processes}
              scroll={{ x: "max-content" }}
              pagination={{ pageSize: 50, showSizeChanger: false }}
              locale={{
                emptyText: (
                  <Empty
                    description={
                      refreshError
                        ? "进程数据刷新失败，请重试"
                        : snapshot
                          ? "没有符合过滤条件的进程"
                          : "正在获取进程数据"
                    }
                  />
                ),
              }}
            />
          </div>
        )}

        {tab === "log" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {logRows.length > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "8px 14px",
                }}
              >
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  共 {logRows.length} 条（保留最近 48 小时）
                </span>
                <Button size="small" danger onClick={() => void handleClearLog()}>
                  清空日志
                </Button>
              </div>
            )}
            {logRows.length === 0 ? (
              <Empty
                description={
                  refreshError
                    ? "日志数据刷新失败，请重试"
                    : snapshot
                      ? "最近 48 小时暂无清理日志"
                      : "正在获取日志数据"
                }
              />
            ) : (
              [...logRows].reverse().map((entry, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: "10px 14px",
                  }}
                >
                  <div
                    style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}
                  >
                    <span style={{ color: "#6b7280", fontSize: 12 }}>{formatTime(entry.time)}</span>
                    <Tag color={entry.source === "auto" ? "green" : "blue"}>
                      {entry.source === "auto" ? "自动" : "手动"}
                    </Tag>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{entry.message}</span>
                  </div>
                  {entry.freedPercent !== undefined && entry.memBeforeMB !== undefined && (
                    <div style={{ marginTop: 8 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 12,
                          color: "#6b7280",
                          marginBottom: 3,
                        }}
                      >
                        <span>
                          内存 {entry.memBeforeMB} MB → {entry.memAfterMB ?? entry.memBeforeMB} MB
                        </span>
                        <span style={{ color: "#52c41a", fontWeight: 600 }}>
                          释放 {entry.freedMB} MB，下降 {entry.freedPercent}%
                        </span>
                      </div>
                      <Progress
                        percent={entry.freedPercent}
                        strokeColor="#52c41a"
                        size="small"
                        showInfo={false}
                      />
                    </div>
                  )}
                  {entry.killed.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#4b5563" }}>
                      终止 {entry.killed.length} 个进程：{" "}
                      {entry.killed.map((k) => `${k.name}(${k.pid}) ${k.rssMB}MB`).join("、")}
                    </div>
                  )}
                  {entry.skipped.length > 0 && (
                    <div style={{ marginTop: 4, fontSize: 12, color: "#9ca3af" }}>
                      跳过：{entry.skipped.map((s) => `${s.name}：${s.reason}`).join("；")}
                    </div>
                  )}
                  {entry.detail && (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        color: "#9ca3af",
                        wordBreak: "break-all",
                      }}
                    >
                      {entry.detail}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === "settings" && settings && (
          <div
            style={{
              maxWidth: 620,
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 20,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                数值修改后，按回车或移开焦点保存。
              </div>
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>后台自动清理</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    持续观察孤儿候选，终止前复核进程身份、归属与保护名单
                  </div>
                </div>
                <Switch
                  checked={settings.autoClean}
                  onChange={(v) => void handleSettingsSave({ autoClean: v })}
                />
              </div>

              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>清理间隔</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>后台自动清理的间隔（分钟）</div>
                </div>
                <SettingNumber
                  min={5}
                  max={720}
                  step={5}
                  value={settings.intervalMinutes}
                  onSave={(v) => handleSettingsSave({ intervalMinutes: v })}
                  unit="分钟"
                />
              </div>

              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>自动深度清理</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    自动检查同一应用中遗留的 helper 子进程
                  </div>
                </div>
                <Switch
                  checked={settings.deepClean}
                  onChange={(v) => void handleSettingsSave({ deepClean: v })}
                />
              </div>

              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>孤儿观察期</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    自动终止前保持孤儿状态的最短观察时间
                  </div>
                </div>
                <SettingNumber
                  min={30}
                  max={3600}
                  step={30}
                  value={settings.orphanGraceSeconds}
                  unit="秒"
                  onSave={(v) => handleSettingsSave({ orphanGraceSeconds: v })}
                />
              </div>

              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>高 CPU 阈值</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    超过此占比标记为高消耗（仅提示，不自动清理）
                  </div>
                </div>
                <SettingNumber
                  min={10}
                  max={500}
                  value={settings.cpuHighThreshold}
                  onSave={(v) => handleSettingsSave({ cpuHighThreshold: v })}
                  unit="%"
                />
              </div>

              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>高内存阈值</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    超过此常驻内存标记为高消耗（仅提示）
                  </div>
                </div>
                <SettingNumber
                  min={50}
                  max={100000}
                  step={50}
                  value={settings.memHighThresholdMB}
                  onSave={(v) => handleSettingsSave({ memHighThresholdMB: v })}
                  unit="MB"
                />
              </div>

              <div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>保护名单</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <Input
                    placeholder="输入进程路径片段或名称，如 Safari"
                    maxLength={500}
                    value={protectInput}
                    onChange={(e) => setProtectInput(e.target.value)}
                    onPressEnter={() => void handleProtectAdd()}
                  />
                  <Button type="primary" onClick={() => void handleProtectAdd()}>
                    添加
                  </Button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {settings.protected.length === 0 ? (
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>暂无，系统进程已内置保护</span>
                  ) : (
                    settings.protected.map((item) => (
                      <div key={item} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13 }}>{item}</span>
                        <Button
                          size="small"
                          type="link"
                          danger
                          onClick={() => void handleProtectRemove(item)}
                        >
                          移除
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GcWindow;
