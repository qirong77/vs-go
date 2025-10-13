import { useEffect } from "react";
import { VS_GO_EVENT } from "../../common/EVENT";

export function Terminal() {
  useEffect(() => {
    window.electron.ipcRenderer.on(VS_GO_EVENT.TERMINAL_SEND_DATA, (data) => {
      console.log("Terminal Data:", data);
    });
    setTimeout(() => {
      window.electron.ipcRenderer.send(VS_GO_EVENT.TERMINAL_RUN_COMMAND, "ls -al");
    }, 1000);
  }, []);
  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">终端</h2>
      <p>这里是终端页面的内容。</p>
    </div>
  );
}
