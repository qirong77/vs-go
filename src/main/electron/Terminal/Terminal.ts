import { spawn, ChildProcess } from "node:child_process";
import os from "node:os";
import path from "node:path";

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
  // 检查桌面目录是否存在，如果不存在则使用用户主目录
  const desktopPath = path.join(os.homedir(), "Desktop");
  let DEFAULT_ROOT_PATH: string;
  try {
    const fs = require("fs");
    if (fs.existsSync(desktopPath) && fs.statSync(desktopPath).isDirectory()) {
      DEFAULT_ROOT_PATH = desktopPath;
    } else {
      DEFAULT_ROOT_PATH = os.homedir();
    }
  } catch {
    DEFAULT_ROOT_PATH = os.homedir();
  }

  let childProcess: ChildProcess | null = null;
  let currentWorkingDirectory = DEFAULT_ROOT_PATH;

  const parseCommand = (command: string) => {
    // 处理 cd 命令
    const cdMatch = command.match(/^cd\s+(.*)$/);
    if (cdMatch) {
      const targetPath = cdMatch[1].trim();
      let newPath: string;

      if (targetPath === "~" || targetPath === "") {
        newPath = os.homedir();
      } else if (targetPath.startsWith("~")) {
        newPath = path.join(os.homedir(), targetPath.slice(2));
      } else if (path.isAbsolute(targetPath)) {
        newPath = targetPath;
      } else {
        newPath = path.join(currentWorkingDirectory, targetPath);
      }

      try {
        // 检查路径是否存在
        const fs = require("fs");
        if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
          currentWorkingDirectory = path.resolve(newPath);
          sendTerminalMessage({
            type: "stdout",
            content: `Changed directory to: ${currentWorkingDirectory}\n`,
          });
          // 发送更新的工作目录给前端
          sendTerminalMessage({
            type: "cwd",
            content: currentWorkingDirectory,
          });
          sendTerminalMessage({
            type: "exit",
            content: "命令执行完成，退出码: 0",
          });
          return { handled: true };
        } else {
          sendTerminalMessage({
            type: "stderr",
            content: `cd: ${targetPath}: No such file or directory\n`,
          });
          sendTerminalMessage({
            type: "exit",
            content: "命令执行完成，退出码: 1",
          });
          return { handled: true };
        }
      } catch (err) {
        sendTerminalMessage({
          type: "stderr",
          content: `cd: ${(err as Error).message}\n`,
        });
        sendTerminalMessage({
          type: "exit",
          content: "命令执行完成，退出码: 1",
        });
        return { handled: true };
      }
    }

    // 处理 pwd 命令
    if (command.trim() === "pwd") {
      sendTerminalMessage({
        type: "stdout",
        content: `${currentWorkingDirectory}\n`,
      });
      sendTerminalMessage({
        type: "exit",
        content: "命令执行完成，退出码: 0",
      });
      return { handled: true };
    }

    // 处理 clear 命令
    if (command.trim() === "clear" || command.trim() === "cls") {
      sendTerminalMessage({
        type: "clear",
        content: "",
      });
      sendTerminalMessage({
        type: "exit",
        content: "命令执行完成，退出码: 0",
      });
      return { handled: true };
    }

    return { handled: false };
  };

  return {
    runCommand(command = "") {
      // 如果有正在运行的进程，先终止它
      if (childProcess) {
        childProcess.kill("SIGTERM");
        sendTerminalMessage({
          type: "info",
          content: "Terminated current process to execute new command\n",
        });
        childProcess = null;
      }

      if (!command.trim()) {
        sendTerminalMessage({ type: "error", content: "Command cannot be empty\n" });
        return;
      }

      // 检查是否是内置命令
      const parseResult = parseCommand(command);
      if (parseResult.handled) {
        return;
      }

      // 根据操作系统选择合适的 shell
      const isWindows = os.platform() === "win32";
      const shell = isWindows ? "cmd.exe" : process.env.SHELL || "/bin/zsh";
      const shellArgs = isWindows ? ["/c", command] : ["-c", command];

      try {
        // 执行命令
        childProcess = spawn(shell, shellArgs, {
          detached: true,
          cwd: currentWorkingDirectory,
          stdio: "pipe",
          env: {
            ...process.env,
            PWD: currentWorkingDirectory, // 确保PWD环境变量正确
          },
          shell: false,
        });

        let hasOutput = false;

        // 处理标准输出
        childProcess.stdout?.on("data", (data) => {
          hasOutput = true;
          sendTerminalMessage({
            type: "stdout",
            content: data.toString(),
          });
        });

        // 处理错误输出
        childProcess.stderr?.on("data", (data) => {
          hasOutput = true;
          sendTerminalMessage({
            type: "stderr",
            content: data.toString(),
          });
        });

        // 处理命令完成事件
        childProcess.on("close", (code, signal) => {
          let exitMessage = `Process exited with code: ${code}`;
          if (signal) {
            exitMessage += `, signal: ${signal}`;
          }

          // 如果没有输出且命令成功执行，给出提示
          if (!hasOutput && code === 0) {
            sendTerminalMessage({
              type: "stdout",
              content: "Command executed successfully (no output)\n",
            });
          }

          sendTerminalMessage({
            type: "exit",
            content: exitMessage,
          });
          childProcess = null;
        });

        // 处理进程错误
        childProcess.on("error", (err) => {
          sendTerminalMessage({
            type: "error",
            content: `Failed to execute command: ${err.message}\n`,
          });
          childProcess = null;
        });

        // 设置超时（30秒）
        const timeout = setTimeout(() => {
          if (childProcess) {
            childProcess.kill("SIGTERM");
            sendTerminalMessage({
              type: "error",
              content: "Command timed out after 30 seconds\n",
            });
          }
        }, 30000);

        childProcess.on("close", () => {
          clearTimeout(timeout);
        });
      } catch (err) {
        sendTerminalMessage({
          type: "error",
          content: `Failed to spawn process: ${(err as Error).message}\n`,
        });
      }
    },

    getCurrentDirectory() {
      return currentWorkingDirectory;
    },

    setWorkingDirectory(newPath: string) {
      try {
        const fs = require("fs");
        if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
          currentWorkingDirectory = path.resolve(newPath);
          return true;
        }
      } catch {
        // Ignore errors
      }
      return false;
    },

    killCurrentProcess() {
      if (childProcess) {
        if (childProcess.pid) {
          try {
            process.kill(-childProcess.pid, "SIGKILL"); // 负号表示终止整个进程组
            return true;
          } catch (error) {
            console.log("终止进程组失败，尝试终止单个进程");
            childProcess.kill("SIGKILL");
            return true;
          }
        }
      }
      return false;
    },

    dispose() {
      // 清理子进程
      if (childProcess) {
        childProcess.kill("SIGTERM");
        childProcess = null;
      }
      sendTerminalMessage({ type: "close", content: "Terminal closed\n" });
    },
  };
}
