import { spawn } from "node:child_process";
import os from "node:os";

// 定义消息类型接口
interface TerminalMessage {
  type: string;
  content?: string;
}

export function createTerminal({
  sendTerminalMessage,
}: {
  sendTerminalMessage: (data: TerminalMessage) => void;
}) {
  const DEFAULT_ROOT_PATH = os.homedir();
  let childProcess: ReturnType<typeof spawn> | null = null;

  return {
    runCommand(command = "") {
      // 如果有正在运行的进程，先终止它
      if (childProcess) {
        childProcess.kill();
        sendTerminalMessage({
          type: "info",
          content: "终止当前命令，执行新命令",
        });
      }

      if (!command.trim()) {
        sendTerminalMessage({ type: "error", content: "命令不能为空" });
        return;
      }

      // 根据操作系统选择合适的 shell
      const shell = os.platform() === "win32" ? "cmd.exe" : "/bin/sh";
      const shellArgs = os.platform() === "win32" ? ["/c", command] : ["-c", command];

      try {
        // 执行命令
        childProcess = spawn(shell, shellArgs, {
          cwd: DEFAULT_ROOT_PATH,
          stdio: "pipe",
          env: process.env, // 继承当前环境变量
        });

        // 发送命令开始的消息
        sendTerminalMessage({
          type: "command",
          content: `$ ${command}`,
        });

        // 处理标准输出
        childProcess.stdout?.on("data", (data) => {
          sendTerminalMessage({
            type: "stdout",
            content: data.toString(),
          });
        });

        // 处理错误输出
        childProcess.stderr?.on("data", (data) => {
          sendTerminalMessage({
            type: "stderr",
            content: data.toString(),
          });
        });

        // 处理命令完成事件
        childProcess.on("close", (code) => {
          sendTerminalMessage({
            type: "exit",
            content: `命令执行完成，退出码: ${code}`,
          });
          childProcess = null;
        });

        // 处理进程错误
        childProcess.on("error", (err) => {
          sendTerminalMessage({
            type: "error",
            content: `执行命令出错: ${err.message}`,
          });
          childProcess = null;
        });
      } catch (err) {
        sendTerminalMessage({
          type: "error",
          content: `创建进程失败: ${(err as Error).message}`,
        });
      }
    },

    dispose() {
      // 清理子进程
      if (childProcess) {
        childProcess.kill();
        childProcess = null;
      }
      sendTerminalMessage({ type: "close", content: "终端已关闭" });
    },
  };
}
