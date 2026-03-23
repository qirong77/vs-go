/**
 * 生成唯一 ID（适用于书签、笔记节点等非安全场景）
 */
export function generateId(prefix = ""): string {
  const random = Math.random().toString(36).slice(2, 11);
  const time = Date.now().toString(36);
  return prefix ? `${prefix}_${time}_${random}` : `${time}_${random}`;
}

/**
 * 格式化错误信息
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
