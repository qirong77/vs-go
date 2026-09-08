export enum GcEvent {
  /** 获取完整快照：进程 + 内存 + 设置 + 日志（invoke） */
  SNAPSHOT = "GC_SNAPSHOT",
  /** 手动运行普通/深度清理（invoke） */
  CLEAN_NOW = "GC_CLEAN_NOW",
  /** 终止指定进程（invoke） */
  KILL_PROCESS = "GC_KILL_PROCESS",
  /** 更新自动清理开关 / 间隔（invoke） */
  SETTINGS_SET = "GC_SETTINGS_SET",
  /** 添加 / 移除保护项（invoke） */
  PROTECT_ADD = "GC_PROTECT_ADD",
  PROTECT_REMOVE = "GC_PROTECT_REMOVE",
  /** 获取 48h 清理日志（invoke） */
  GET_LOG = "GC_GET_LOG",
  /** 主进程 → 渲染层推送（自动清理完成、设置变更等） */
  PUSH = "GC_PUSH",
}
