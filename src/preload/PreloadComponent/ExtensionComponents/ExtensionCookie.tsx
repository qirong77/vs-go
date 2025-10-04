import React, { useState, useEffect } from "react";
import { ExtensionPopover } from "./ExtensionPopover";
import { VS_GO_EVENT } from "../../../common/EVENT";
import { SavedCookieByUrl } from "../../../common/type";
import { ipcRenderer } from "electron";

interface ToastMessage {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

export const ExtensionCookie: React.FC = () => {
  const [savedCookies, setSavedCookies] = useState<SavedCookieByUrl[]>([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Toast 消息系统
  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    const id = Math.random().toString(36).slice(2);
    const toast: ToastMessage = { id, message, type };
    setToasts((prev) => [...prev, toast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  // 获取已保存的 Cookie 列表
  const loadSavedCookies = async () => {
    try {
      const cookies = await ipcRenderer.invoke(VS_GO_EVENT.COOKIE_GET_SAVED_LIST_BY_URL);
      setSavedCookies(cookies);
    } catch (error) {
      console.error("加载已保存 Cookie 失败:", error);
    }
  };

  // 保存当前页面的 Cookie
  const saveCurrentCookies = async () => {
    try {
      setLoading(true);

      const result = await ipcRenderer.invoke(VS_GO_EVENT.COOKIE_SAVE_BY_URL, window.location.href);

      if (result.success) {
        await loadSavedCookies();
        showToast("成功保存当前页面的所有 Cookie", "success");
      } else {
        showToast(result.error || "保存 Cookie 失败", "error");
      }
    } catch (error) {
      console.error("保存 Cookie 失败:", error);
      showToast("保存 Cookie 失败，请稍后重试", "error");
    } finally {
      setLoading(false);
    }
  };

  // 删除已保存的 Cookie
  const deleteSavedCookie = async (cookieId: string) => {
    try {
      const result = await ipcRenderer.invoke(VS_GO_EVENT.COOKIE_DELETE_BY_URL, cookieId);
      if (result.success) {
        await loadSavedCookies();
        showToast("Cookie 删除成功", "success");
      } else {
        showToast("删除 Cookie 失败", "error");
      }
    } catch (error) {
      console.error("删除 Cookie 失败:", error);
      showToast("删除 Cookie 失败，请稍后重试", "error");
    }
  };

  // 应用 Cookie 到当前页面
  const applyCookie = async (cookie: SavedCookieByUrl) => {
    try {
      setLoading(true);
      const result = await ipcRenderer.invoke(
        VS_GO_EVENT.COOKIE_APPLY_BY_URL,
        cookie,
        window.location.href
      );

      if (result.success) {
        showToast(`Cookie 应用成功，设置了 ${result.count} 个cookie，即将刷新页面...`, "success");
        // 延迟刷新以显示成功消息
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        showToast(`应用 Cookie 失败: ${result.error}`, "error");
      }
    } catch (error) {
      console.error("应用 Cookie 失败:", error);
      showToast("应用 Cookie 失败，请稍后重试", "error");
    } finally {
      setLoading(false);
    }
  };

  // 清除所有已保存的 Cookie
  const clearAllCookies = async () => {
    if (!confirm("确定要删除所有已保存的 Cookie 吗？此操作无法撤销。")) {
      return;
    }

    try {
      // 由于没有批量删除的 API，我们逐个删除
      for (const cookie of savedCookies) {
        await ipcRenderer.invoke(VS_GO_EVENT.COOKIE_DELETE_BY_URL, cookie.id);
      }
      await loadSavedCookies();
      showToast("所有 Cookie 已清除", "success");
    } catch (error) {
      console.error("清除 Cookie 失败:", error);
      showToast("清除 Cookie 失败，请稍后重试", "error");
    }
  };

  // 导出 Cookie 到剪贴板
  const exportCookies = async () => {
    try {
      const exportData = {
        exportTime: new Date().toISOString(),
        cookies: savedCookies,
      };

      await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
      showToast("Cookie 数据已复制到剪贴板", "success");
    } catch (error) {
      console.error("导出 Cookie 失败:", error);
      showToast("导出失败，请稍后重试", "error");
    }
  };

  // 组件加载时获取已保存的 Cookie
  useEffect(() => {
    loadSavedCookies();
  }, []);

  const cookieContent = (
    <>
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .cookie-item:hover {
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          transform: translateY(-1px);
        }
        .cookie-item {
          transition: all 0.2s ease;
        }
      `}</style>
      <div style={{ width: "400px", maxHeight: "500px", overflow: "scroll", position: "relative" }}>
        {/* Toast 消息 */}
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              position: "fixed",
              top: "20px",
              right: "20px",
              padding: "12px 16px",
              borderRadius: "6px",
              color: "white",
              fontSize: "14px",
              zIndex: 10000,
              minWidth: "200px",
              background:
                toast.type === "success"
                  ? "#10b981"
                  : toast.type === "error"
                    ? "#ef4444"
                    : "#3b82f6",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
              animation: "slideIn 0.3s ease-out",
            }}
          >
            {toast.message}
          </div>
        ))}

        <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 600, color: "#1f2937" }}>
          Cookie 管理
        </h3>

        <div
          style={{
            marginBottom: "16px",
            padding: "12px",
            background: "#f9fafb",
            borderRadius: "8px",
          }}
        >
          <div style={{ marginBottom: "8px", fontSize: "14px", color: "#374151" }}>
            <strong>当前域名:</strong> {window.location.hostname}
          </div>
          <button
            onClick={saveCurrentCookies}
            disabled={loading}
            style={{
              width: "100%",
              padding: "8px 16px",
              background: loading ? "#9ca3af" : "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background-color 0.2s ease",
            }}
          >
            {loading ? "保存中..." : "保存页面 Cookie"}
          </button>
        </div>

        {/* <div style={{ marginBottom: "12px" }}>
          <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: 600, color: "#374151" }}>
            已保存的 Cookie ({savedCookies.length})
          </h4>
          {savedCookies.length > 0 && (
            <>
              <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                <button
                  onClick={exportCookies}
                  style={{
                    flex: 1,
                    padding: "6px 12px",
                    background: "#6b7280",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "12px",
                    cursor: "pointer",
                    transition: "background-color 0.2s ease",
                  }}
                >
                  导出
                </button>
                <button
                  onClick={clearAllCookies}
                  style={{
                    flex: 1,
                    padding: "6px 12px",
                    background: "#ef4444",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "12px",
                    cursor: "pointer",
                    transition: "background-color 0.2s ease",
                  }}
                >
                  清除全部
                </button>
              </div>
            </>
          )}
        </div> */}

        {savedCookies.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "#6b7280",
              fontSize: "13px",
              padding: "20px 0",
              fontStyle: "italic",
            }}
          >
            暂无保存的 Cookie
          </div>
        ) : (
          <div style={{ maxHeight: "260px", overflow: "auto" }}>
            {savedCookies.map((cookie) => (
              <div
                key={cookie.id}
                className="cookie-item"
                style={{
                  padding: "12px",
                  marginBottom: "8px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  background: "#ffffff",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "#1f2937",
                    marginBottom: "4px",
                  }}
                >
                  {cookie.domain} - {cookie.saveTimeDisplay}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    marginBottom: "4px",
                    wordBreak: "break-all",
                  }}
                >
                  {cookie.url}
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "8px",
                    marginTop: "8px",
                  }}
                >
                  <button
                    onClick={() => applyCookie(cookie)}
                    disabled={loading}
                    style={{
                      padding: "4px 8px",
                      background: loading ? "#9ca3af" : "#10b981",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      fontSize: "12px",
                      cursor: loading ? "not-allowed" : "pointer",
                      transition: "background-color 0.2s ease",
                    }}
                  >
                    应用
                  </button>
                  <button
                    onClick={() => deleteSavedCookie(cookie.id)}
                    style={{
                      padding: "4px 8px",
                      background: "#ef4444",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      fontSize: "12px",
                      cursor: "pointer",
                      transition: "background-color 0.2s ease",
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  return (
    <ExtensionPopover content={cookieContent} trigger="click" placement="bottom-right">
      <div
        style={{
          width: "28px",
          height: "28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "6px",
          transition: "background-color 0.2s ease",
          cursor: "pointer",
        }}
      >
        🍪
      </div>
    </ExtensionPopover>
  );
};
