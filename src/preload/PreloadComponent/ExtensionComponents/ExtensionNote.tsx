import { ExtensionPopover } from "./ExtensionPopover";

// 声明全局类型

export const ExtensionNote: React.FC = () => {
  // 在window上监听事件
  window.addEventListener("myCustomEvent", function (e) {
    console.log("自定义事件被触发了");
  });
  return (
    <ExtensionPopover
      content={
        <div style={{ width: "600px", height: "800px", border: "1px solid #eee" }}>
          <div id="monaco-markdown-editor" style={{ width: "100%", height: "100%" }}>
          </div>
        </div>
      }
      trigger="click"
      placement="bottom-right"
    >
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
