// 应用图标获取功能已暂停。
// 原实现使用 fileIconToBuffer 但存在性能问题。
// 如果需要恢复，可考虑使用缓存 + 异步加载策略。

export const ImageMap = new Map<string, string>();

export function getIconBuffers(_paths: string[] = []): Promise<string> {
  return Promise.resolve("");
}
