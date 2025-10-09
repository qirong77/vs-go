const ELEMENT_ID = "monaco-markdown-editor";
const script = document.createElement("script");
if (!window.electron) {
  console.log("未检测到electron环境，使用模拟的ipcRenderer");
  window.electron = {
    ipcRenderer: {
      invoke(channel, ...args) {
        console.log("模拟调用ipcRenderer.invoke:", channel, args);
        if (channel === "monaco-markdown-editor-get-content") {
          return Promise.resolve("# 模拟的初始内容\n\n这是一些示例的Markdown内容。");
        }
        return Promise.resolve("");
      },
      send(channel, ...args) {
        console.log("模拟调用ipcRenderer.send:", channel, args);
        if (channel === "monaco-markdown-editor-content-changed") {
          console.log("内容变更:", args[0]);
        }
      },
    },
  };
}
script.src = "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs/loader.js";
script.onload = () => {
  window.require.config({
    paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs" },
  });
  window.require(["vs/editor/editor.main"], function () {
    const editor = window.monaco.editor.create(document.getElementById(ELEMENT_ID), {
      value: "# hello",
      language: "markdown",
      automaticLayout: true,
      minimap: { enabled: false },
    });
    // 添加链接点击处理 - 检测点击链接并阻止默认行为
    editor.onMouseDown(function (e) {
      if (e.target && e.target.detail) {
        const position = e.target.position;
        if (position) {
          const model = editor.getModel();
          const line = model.getLineContent(position.lineNumber);
          const column = position.column;

          // 简单的链接检测正则表达式
          const linkRegex = /\[([^\]]*)\]\(([^)]*)\)/g;
          let match;

          while ((match = linkRegex.exec(line)) !== null) {
            const linkStart = match.index;
            const linkEnd = match.index + match[0].length;

            // 检查点击是否在链接范围内
            if (column >= linkStart + 1 && column <= linkEnd + 1) {
              console.log("点击了链接:", {
                text: match[1],
                url: match[2],
                position: position,
                fullMatch: match[0],
              });

              // 阻止默认行为
              e.event.preventDefault();
              e.event.stopPropagation();
              break;
            }
          }

          // 也检测直接的URL链接
          const urlRegex = /https?:\/\/[^\s)]+/g;
          while ((match = urlRegex.exec(line)) !== null) {
            const urlStart = match.index;
            const urlEnd = match.index + match[0].length;

            if (column >= urlStart + 1 && column <= urlEnd + 1) {
              console.log("点击了URL:", {
                url: match[0],
                position: position,
              });
              window.electron.ipcRenderer.send("FLOATING_WINDOW_CREATE", { url: match[0] });
              // 阻止默认行为
              e.event.preventDefault();
              e.event.stopPropagation();
              break;
            }
          }
        }
      }
    });

    window.electron.ipcRenderer.invoke("monaco-markdown-editor-get-content").then((content) => {
      editor.setValue(content);
      const debounce = (func, wait) => {
        let timeout;
        return (...args) => {
          clearTimeout(timeout);
          timeout = setTimeout(() => func(...args), wait);
        };
      };
      editor.onDidChangeModelContent(
        debounce(() => {
          const content = editor.getValue();
          window.electron.ipcRenderer.invoke("monaco-markdown-editor-content-changed", content);
        }, 500)
      );
    });
  });
};
document.body.appendChild(script);
