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
} from "antd";
import type { TableProps } from "antd";
import { GcEvent } from "@windows/gc/events";
import { normalizeGcSettings } from "@windows/gc/settings";
import type { GcProcessInfo, GcProcessTag, GcSettings, GcSnapshot } from "@windows/gc/types";

const { ipcRenderer } = window.electron;

const TAG_META: Record<GcProcessTag, { label: string; color: string }> = {
  "orphan-helper": { label: "孤儿 helper", color: "magenta" },
  "orphan-descendant": { label: "深层残留", color: "purple" },
  zombie: { label: "僵尸进程", color: "default" },
  "high-cpu": { label: "高CPU", color: "volcano" },
  "high-mem": { label: "高内存", color: "orange" },
  protected: { label: "保护", color: "blue" },
  system: { label: "系统", color: "default" },
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
  return (
    <div style={{ minWidth: 260 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: "#6b7280", fontSize: 12 }}>
          内存 {memory.usedMB} / {memory.totalMB} MB · 空闲 {memory.freeMB} MB
        </span>
        <span style={{ color: "#1a73e8", fontSize: 12, fontWeight: 600 }}>
          {memory.usedPercent}%
        </span>
      </div>
      <Progress
        percent={memory.usedPercent}
        strokeColor={memory.usedPercent > 85 ? "#f5222d" : "#1a73e8"}
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
    }, 10000);
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
    if (tagFilter.size === 0) return snapshot.processes;
    return snapshot.processes.filter((p) => p.tags.some((t) => tagFilter.has(t)));
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
      ellipsis: true,
      render: (v: string, r: GcProcessInfo) => <span title={r.path}>{v}</span>,
    },
    {
      title: "CPU %",
      dataIndex: "cpu",
      width: 90,
      sorter: (a: GcProcessInfo, b: GcProcessInfo) => a.cpu - b.cpu,
      render: (v: number) => (
        <span style={{ color: v >= (settings?.cpuHighThreshold ?? 80) ? "#f5222d" : "#202124" }}>
          {v.toFixed(1)}
        </span>
      ),
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
    { title: "状态", dataIndex: "state", width: 70 },
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
          {memory && <MemoryBar memory={memory} />}
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

        <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            检测到{" "}
            <b style={{ color: garbage.length > 0 ? "#eb2f96" : "#202124" }}>
              {snapshot ? garbage.length : "—"}
            </b>{" "}
            个清理候选（含深层残留）
            {garbageMB > 0 && (
              <>
                （占用约 <b style={{ color: "#1a73e8" }}>{garbageMB.toFixed(1)} MB</b>）
              </>
            )}
          </span>
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            高消耗进程{" "}
            <b style={{ color: highRisk.length > 0 ? "#fa8c16" : "#202124" }}>
              {snapshot ? highRisk.length : "—"}
            </b>{" "}
            个 （高消耗仅作为提示）
          </span>
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
        <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
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
        style={{ padding: "10px 20px 0", background: "#ffffff", borderBottom: "1px solid #e5e7eb" }}
      >
        <Segmented
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
          options={[
            { label: `进程 (${snapshot?.processes.length ?? "—"})`, value: "process" },
            { label: `清理日志 (${snapshot ? logRows.length : "—"})`, value: "log" },
            { label: "设置", value: "settings" },
          ]}
        />
      </div>

      {/* 内容 */}
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {tab === "process" && (
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              {(Object.keys(TAG_META) as GcProcessTag[]).map((t) => {
                const meta = TAG_META[t];
                const active = tagFilter.has(t);
                return (
                  <Tag
                    key={t}
                    color={active ? meta.color : undefined}
                    style={{ cursor: "pointer", padding: "2px 10px" }}
                    onClick={() => toggleTag(t)}
                  >
                    {meta.label}
                  </Tag>
                );
              })}
            </div>
            <Table
              rowKey={(process) => `${process.pid}:${process.startedAt}`}
              size="small"
              loading={loading}
              columns={cols}
              dataSource={processes}
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
                    {entry.freedMB > 0 && (
                      <Tag color="purple">终止前 RSS 合计 {entry.freedMB} MB</Tag>
                    )}
                  </div>
                  {entry.killed.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#4b5563" }}>
                      终止：{entry.killed.map((k) => `${k.name}(${k.pid})`).join("、")}
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
