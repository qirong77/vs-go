import React, { useState, useEffect, useCallback } from "react";
import { ExtensionPopover } from "./ExtensionPopover";
import { VS_GO_EVENT } from "../../../common/EVENT";
import { ipcRenderer } from "electron";
import { debounce } from "../../../common/debounce";

interface ToastMessage {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

export const ExtensionNote: React.FC = () => {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [lastUpdateTime, setLastUpdateTime] = useState("");
  const [isPreviewMode, setIsPreviewMode] = useState(true);

  // Toast 消息系统
  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    const id = Math.random().toString(36).slice(2);
    const toast: ToastMessage = { id, message, type };
    setToasts((prev) => [...prev, toast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  // 加载笔记
  const loadNote = async () => {
    try {
      const note = await ipcRenderer.invoke(VS_GO_EVENT.SINGLE_NOTE_GET);
      if (note) {
        setContent(note.content);
        setLastUpdateTime(note.updateTimeDisplay);
      }
    } catch (error) {
      console.error("加载笔记失败:", error);
    }
  };

  // 自动保存笔记
  const saveNote = async (contentToSave: string) => {
    if (!contentToSave.trim()) return; // 空内容不保存

    try {
      setSaving(true);
      const noteData = {
        title: "", // 不需要标题
        content: contentToSave.trim(),
      };

      const result = await ipcRenderer.invoke(VS_GO_EVENT.SINGLE_NOTE_SAVE, noteData);

      if (result.success) {
        setLastUpdateTime(result.note.updateTimeDisplay);
      } else {
        showToast(`保存失败: ${result.error}`, "error");
      }
    } catch (error) {
      console.error("保存笔记失败:", error);
      showToast("保存笔记失败", "error");
    } finally {
      setSaving(false);
    }
  };

  // 防抖保存函数
  const debouncedSave = useCallback(
    debounce((contentToSave: string) => {
      saveNote(contentToSave);
    }, 1000),
    []
  );

  // 处理文本内容变化
  const handleContentChange = (value: string) => {
    setContent(value);
    // 自动保存
    debouncedSave(value);
  };

  // 链接检测和渲染
  const linkifyText = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    
    return parts.map((part, index) => {
      if (urlRegex.test(part)) {
        return (
          <a
            key={index}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handleLinkClick(part);
            }}
            style={{
              color: "#2563eb",
              textDecoration: "none",
              cursor: "pointer",
              wordBreak: "break-all",
              padding: "1px 4px",
              borderRadius: "3px",
              transition: "all 0.2s ease",
              border: "1px solid transparent",
              display: "inline-block",
              maxWidth: "100%",
            }}
            onMouseEnter={(e) => {
              const target = e.target as HTMLElement;
              target.style.backgroundColor = "#dbeafe";
              target.style.borderColor = "#93c5fd";
              target.style.textDecoration = "underline";
            }}
            onMouseLeave={(e) => {
              const target = e.target as HTMLElement;
              target.style.backgroundColor = "transparent";
              target.style.borderColor = "transparent";
              target.style.textDecoration = "none";
            }}
            title={`点击打开：${part}`}
          >
            🔗 {part}
          </a>
        );
      }
      return part;
    });
  };

  // 处理链接点击
  const handleLinkClick = async (url: string) => {
    try {
      await ipcRenderer.send(VS_GO_EVENT.FLOATING_WINDOW_CREATE, { url });
      showToast("链接已在外部浏览器中打开", "success");
    } catch (error) {
      console.error("打开链接失败:", error);
      showToast("打开链接失败", "error");
    }
  };

  // 渲染预览内容
  const renderPreviewContent = () => {
    if (!content.trim()) {
      return (
        <div
          style={{
            padding: "40px 12px",
            color: "#9ca3af",
            fontStyle: "italic",
            textAlign: "center",
            border: "2px dashed #e5e7eb",
            borderRadius: "6px",
            minHeight: "200px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#fafafa",
          }}
        >
          <div>
            <div style={{ fontSize: "16px", marginBottom: "8px" }}>📝</div>
            <div>暂无内容</div>
            <div style={{ fontSize: "12px", marginTop: "4px", color: "#d1d5db" }}>
              切换到编辑模式开始写作
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          padding: "16px",
          border: "1px solid #e5e7eb",
          borderRadius: "6px",
          minHeight: "200px",
          fontSize: "14px",
          lineHeight: "1.7",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          backgroundColor: "white",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
        }}
      >
        {linkifyText(content)}
      </div>
    );
  };

  // 组件加载时获取笔记
  useEffect(() => {
    loadNote();
  }, []);

  const noteContent = (
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
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(0.8);
          }
        }
        .note-item:hover {
          background-color: #f9fafb;
          transform: translateY(-1px);
        }
        .note-item {
          transition: all 0.2s ease;
        }
      `}</style>
      <div style={{ width: "480px", overflow: "hidden", position: "relative" }}>
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

        {/* 标题栏 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            paddingBottom: "12px",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <h3 style={{ margin: "0", fontSize: "16px", fontWeight: 600, color: "#1f2937" }}>笔记</h3>
          
          {/* 模式切换按钮 */}
          <div
            style={{
              display: "flex",
              backgroundColor: "#f3f4f6",
              borderRadius: "6px",
              padding: "2px",
            }}
          >
            <button
              onClick={() => setIsPreviewMode(false)}
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                backgroundColor: !isPreviewMode ? "#3b82f6" : "transparent",
                color: !isPreviewMode ? "white" : "#6b7280",
                fontWeight: !isPreviewMode ? 500 : 400,
              }}
            >
              编辑
            </button>
            <button
              onClick={() => setIsPreviewMode(true)}
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                backgroundColor: isPreviewMode ? "#3b82f6" : "transparent",
                color: isPreviewMode ? "white" : "#6b7280",
                fontWeight: isPreviewMode ? 500 : 400,
              }}
            >
              预览
            </button>
          </div>
        </div>

        {/* 笔记编辑视图 */}
        <div>
          {/* 根据模式显示不同内容 */}
          {isPreviewMode ? (
            /* 预览模式 */
            <div style={{ height: "600px", overflow: "auto" }}>
              {renderPreviewContent()}
            </div>
          ) : (
            /* 编辑模式 */
            <textarea
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="在此输入笔记内容...&#10;&#10;提示：输入网址链接（如 https://example.com）后，在预览模式下可以点击打开"
              style={{
                width: "100%",
                minHeight: "200px",
                height: "600px",
                padding: "12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
                lineHeight: "1.5",
                resize: "vertical",
                outline: "none",
                fontFamily: "inherit",
                background: "white",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
              onBlur={(e) => (e.target.style.borderColor = "#d1d5db")}
            />
          )}

          {/* 底部状态栏 */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "12px",
              padding: "8px 0",
              borderTop: "1px solid #f3f4f6",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                color: "#6b7280",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {saving && (
                <span
                  style={{ color: "#3b82f6", display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      backgroundColor: "#3b82f6",
                      borderRadius: "50%",
                      animation: "pulse 1.5s infinite",
                    }}
                  ></span>
                  正在保存...
                </span>
              )}
              {lastUpdateTime && !saving && <span>上次更新: {lastUpdateTime}</span>}
              {!lastUpdateTime && !saving && !isPreviewMode && (
                <span style={{ color: "#9ca3af" }}>自动保存已开启</span>
              )}
              {isPreviewMode && (
                <span style={{ color: "#10b981", display: "flex", alignItems: "center", gap: "4px" }}>
                  👁️ 预览模式 - 点击链接可打开网页
                </span>
              )}
            </div>
            
            {/* 字符计数 */}
            <div style={{ fontSize: "11px", color: "#9ca3af" }}>
              {content.length} 字符
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <ExtensionPopover content={noteContent} trigger="click" placement="bottom-right">
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
        📝
      </div>
    </ExtensionPopover>
  );
};
