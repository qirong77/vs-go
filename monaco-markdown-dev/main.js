const ELEMENT_ID = "monaco-markdown-editor";
const script = document.createElement("script");
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
          const event = new CustomEvent("monaco-markdown-editor-content-change", {
            detail: content,
          });
          window.dispatchEvent(event);
        }, 500)
      );
    });
  });
};
document.body.appendChild(script);
