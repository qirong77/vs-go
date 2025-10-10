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
function createEditor() {
  const ELEMENT_ID = "monaco-markdown-editor";
  const script = document.createElement("script");
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs/loader.js";
  script.onload = () => {
    window.require.config({
      paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs" },
    });
    const el = document.getElementById(ELEMENT_ID);
    if (!el) {
      console.error("未找到编辑器容器元素");
      return;
    }
    window.require(["vs/editor/editor.main"], function () {
      console.log("Monaco Editor脚本加载完成");
      const editor = window.monaco.editor.create(el, {
        value: "# hello",
        language: "markdown",
        automaticLayout: true,
        minimap: { enabled: false },
      });
      const currentKey = { ctrl: false, shift: false, alt: false, meta: false };
      editor.onKeyDown((e) => {
        if (e.ctrlKey) currentKey.ctrl = true;
        if (e.shiftKey) currentKey.shift = true;
        if (e.altKey) currentKey.alt = true;
        if (e.metaKey) currentKey.meta = true;
      });
      editor.onKeyUp((e) => {
        if (!e.ctrlKey) currentKey.ctrl = false;
        if (!e.shiftKey) currentKey.shift = false;
        if (!e.altKey) currentKey.alt = false;
        if (!e.metaKey) currentKey.meta = false;
      });
      // 添加链接点击处理 - 检测点击链接并阻止默认行为
      editor.onMouseDown(function (e) {
        if (e.target && e.target.detail) {
          const position = e.target.position;
          if (position) {
            const model = editor.getModel();
            const line = model.getLineContent(position.lineNumber);
            const column = position.column;
            const linkRegex = /https?:\/\/[^\s)]+/g;
            let match;
            while ((match = linkRegex.exec(line)) !== null) {
              const linkStart = match.index;
              const linkEnd = match.index + match[0].length;
              if (column >= linkStart + 1 && column <= linkEnd + 1) {
                console.log("点击了链接:", {
                  text: match[1],
                  url: match[2],
                  position: position,
                  fullMatch: match[0],
                });
                if (currentKey.meta) {
                  window.electron.ipcRenderer.send("FLOATING_WINDOW_CREATE", { url: match[0] });
                }
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
  script.onerror = () => {
    console.error("加载Monaco Editor脚本失败");
  };
  document.body.appendChild(script);
}

function detectWhiteScreen() {
  // 检查文档是否完全加载
  if (document.readyState !== "complete") {
    console.log("页面尚未完全加载，暂不检测白屏");
    return false;
  }

  // 方法1: 检查body是否为空或仅包含空白内容
  const bodyContent = document.body.textContent.trim();
  const isBodyEmpty = bodyContent === "";

  // 方法2: 检查关键区域的背景色和内容
  const checkElement = (element) => {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    // 检查是否为白色背景
    const isWhiteBg =
      style.backgroundColor === "rgb(255, 255, 255)" ||
      style.backgroundColor === "#ffffff" ||
      style.backgroundColor === "white";

    // 检查元素是否有子元素
    const hasContent = element.children.length > 0 || element.textContent.trim() !== "";

    return isWhiteBg && !hasContent;
  };

  // 检查body和html元素
  const isHtmlWhite = checkElement(document.documentElement);
  const isBodyWhite = checkElement(document.body);

  // 方法3: 检查视口内是否有可见元素
  const hasVisibleElements = () => {
    const elements = document.querySelectorAll("body *");
    for (let el of elements) {
      const rect = el.getBoundingClientRect();
      // 检查元素是否在视口内且可见
      if (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0
      ) {
        return true;
      }
    }
    return false;
  };

  const visibleElementsExist = hasVisibleElements();

  // 综合判断
  const isWhiteScreen = isBodyEmpty && (isHtmlWhite || isBodyWhite) && !visibleElementsExist;

  if (isWhiteScreen) {
    console.log("检测到页面白屏");
  } else {
    console.log("页面未出现白屏");
  }

  return isWhiteScreen;
}
setTimeout(() => {
  const isWhiteScreen = detectWhiteScreen();
  if (!isWhiteScreen) {
    const ext = document.querySelector(".preload-component-extension-popover");
    ext.addEventListener("click", () => {
      if (!window.monaco) createEditor();
    });
    return;
  }
  console.log("页面白屏，尝试重新加载");
}, 0);
