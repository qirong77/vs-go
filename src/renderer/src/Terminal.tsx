import { useEffect, useState } from "react";
import { VS_GO_EVENT } from "../../common/EVENT";
import AnsiToHtml from "ansi-to-html";
const TerminalOutput = ({ output }) => {
  // 转换 ANSI 字符串为 HTML
  const [htmlOutput, setHtmlOutput] = useState("");
  // 初始化转换器（可自定义主题）
  const ansiConverter = new AnsiToHtml({
    newline: true, // 自动将 \n 转为 <br>
    escapeXML: true, // 转义 HTML 特殊字符（防 XSS）
  });
  useEffect(() => {
    if (output) {
      const html = ansiConverter.toHtml(output);
      setHtmlOutput(html);
    }
  }, [output]);

  return <div className="terminal-output" dangerouslySetInnerHTML={{ __html: htmlOutput }} />;
};
export function Terminal() {
  const [output, setOutput] = useState("");

  useEffect(() => {
    window.electron.ipcRenderer.on(VS_GO_EVENT.TERMINAL_SEND_DATA, (e, data) => {
      setOutput((prev) => prev + data.type + data.content);
    });
    setTimeout(() => {
      window.electron.ipcRenderer.send(VS_GO_EVENT.TERMINAL_RUN_COMMAND, "ls");
      setTimeout(() => {
        window.electron.ipcRenderer.send(VS_GO_EVENT.TERMINAL_RUN_COMMAND, "pwd");
      }, 1000);
    }, 1000);
  }, []);
  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">终端</h2>
      <p>这里是终端页面的内容。</p>
      <TerminalOutput output={output} />
      <input/>  
    </div>
  );
}
