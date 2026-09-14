type ActiveTabUrlListener = (url: string) => void;

const listeners = new Set<ActiveTabUrlListener>();

/**
 * 广播「最近聚焦浏览器窗口当前激活标签页 URL」变化。
 * 浏览器窗口切换 tab / 页面导航 / 窗口聚焦时触发，订阅方（如 Cookie 管理窗口）
 * 据此保持与当前页面的实时同步。空字符串表示当前没有可用页面。
 */
export function emitActiveTabUrl(url: string): void {
  for (const listener of listeners) {
    try {
      listener(url);
    } catch (error) {
      console.error("[activeTabUrl] 监听器执行失败:", error);
    }
  }
}

/** 订阅激活标签页 URL 变化，返回取消订阅函数。 */
export function onActiveTabUrlChange(listener: ActiveTabUrlListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
