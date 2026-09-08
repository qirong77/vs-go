import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { formatError } from "@shared/utils";
import { GcEvent } from "./events";
import { isGcWindowSender } from "./electron";
import { killProcessByPid, resetGcObservations } from "./gc-core";
import { appendGcLog, getGcLog } from "./gc-log";
import { buildSnapshot, notifyGcChanged, runCleanNow, startGcRunner } from "./runner";
import { getGcSettings, setGcSettings } from "./store";
import type { GcSettings } from "./types";

function assertGcSender(event: IpcMainInvokeEvent): void {
  if (!isGcWindowSender(event.sender) || event.senderFrame !== event.sender.mainFrame) {
    throw new Error("仅允许系统 GC 窗口操作进程清理");
  }
}

export function registerGcHandlers(): void {
  ipcMain.handle(GcEvent.SNAPSHOT, async (event) => {
    assertGcSender(event);
    return buildSnapshot();
  });

  ipcMain.handle(GcEvent.CLEAN_NOW, async (event, mode: "standard" | "deep" = "standard") => {
    assertGcSender(event);
    if (mode !== "standard" && mode !== "deep") throw new Error("无效的清理模式");
    return runCleanNow("manual", mode);
  });

  ipcMain.handle(GcEvent.KILL_PROCESS, async (event, pid: number, startedAt: string) => {
    assertGcSender(event);
    try {
      const result = await killProcessByPid(pid, startedAt);
      appendGcLog({
        time: Date.now(),
        source: "manual",
        action: "kill",
        message: `手动终止${result.killed ? "完成" : "已跳过"}：${result.name ?? pid}`,
        killed: result.killed
          ? [{ pid, name: result.name ?? String(pid), rssMB: result.rssMB ?? 0 }]
          : [],
        freedMB: result.killed ? (result.rssMB ?? 0) : 0,
        skipped: result.killed
          ? []
          : [{ pid, name: result.name ?? String(pid), reason: result.reason ?? "未能终止" }],
      });
      notifyGcChanged("kill");
      return result;
    } catch (error) {
      appendGcLog({
        time: Date.now(),
        source: "manual",
        action: "kill",
        message: "手动终止失败",
        killed: [],
        skipped: [],
        freedMB: 0,
        detail: formatError(error),
      });
      notifyGcChanged("kill");
      return { killed: false, reason: formatError(error) };
    }
  });

  ipcMain.handle(GcEvent.SETTINGS_SET, async (event, patch: Partial<GcSettings>) => {
    assertGcSender(event);
    const previous = getGcSettings();
    const settings = setGcSettings(patch);
    if (JSON.stringify(previous.protected) !== JSON.stringify(settings.protected))
      resetGcObservations();
    if (
      previous.autoClean !== settings.autoClean ||
      previous.intervalMinutes !== settings.intervalMinutes ||
      previous.deepClean !== settings.deepClean ||
      previous.orphanGraceSeconds !== settings.orphanGraceSeconds
    )
      startGcRunner();
    appendGcLog({
      time: Date.now(),
      source: "manual",
      action: "settings",
      message: `更新 GC 设置`,
      killed: [],
      freedMB: 0,
      skipped: [],
      detail: JSON.stringify(settings),
    });
    notifyGcChanged("settings");
    return settings;
  });

  ipcMain.handle(GcEvent.PROTECT_ADD, async (event, value: string) => {
    assertGcSender(event);
    if (typeof value !== "string") throw new Error("保护项必须为字符串");
    const valueStr = value.trim();
    if (!valueStr) return getGcSettings();
    const settings = getGcSettings();
    const next = setGcSettings({ protected: [...settings.protected, valueStr] });
    resetGcObservations();
    appendGcLog({
      time: Date.now(),
      source: "manual",
      action: "protect",
      message: `添加保护：${valueStr}`,
      killed: [],
      freedMB: 0,
      skipped: [],
    });
    notifyGcChanged("protect");
    return next;
  });

  ipcMain.handle(GcEvent.PROTECT_REMOVE, async (event, value: string) => {
    assertGcSender(event);
    if (typeof value !== "string") throw new Error("保护项必须为字符串");
    const settings = getGcSettings();
    const next = setGcSettings({ protected: settings.protected.filter((s) => s !== value) });
    resetGcObservations();
    appendGcLog({
      time: Date.now(),
      source: "manual",
      action: "protect",
      message: `移除保护：${value}`,
      killed: [],
      freedMB: 0,
      skipped: [],
    });
    notifyGcChanged("protect");
    return next;
  });

  ipcMain.handle(GcEvent.GET_LOG, async (event) => {
    assertGcSender(event);
    return getGcLog();
  });
}
