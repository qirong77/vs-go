import { spawn, ChildProcess } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { existsSync, statSync } from "node:fs";

// 定义消息类型接口
interface TerminalMessage {
  type: string;
  content?: string;
}

export class Terminal {
  private childProcess: ChildProcess | null = null;
  private currentWorkingDirectory: string;
  private sendTerminalMessage: (data: TerminalMessage) => void;

  constructor({ sendTerminalMessage }: { sendTerminalMessage: (data: TerminalMessage) => void }) {
    this.sendTerminalMessage = sendTerminalMessage;

    // 检查桌面目录是否存在，如果不存在则使用用户主目录
    const desktopPath = path.join(os.homedir(), "Desktop");
    try {
      if (existsSync(desktopPath) && statSync(desktopPath).isDirectory()) {
        this.currentWorkingDirectory = desktopPath;
      } else {
        this.currentWorkingDirectory = os.homedir();
      }
    } catch {
      this.currentWorkingDirectory = os.homedir();
    }
  }

  private parseCommand(command: string) {
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
        newPath = path.join(this.currentWorkingDirectory, targetPath);
      }

      try {
        // 检查路径是否存在
        if (existsSync(newPath) && statSync(newPath).isDirectory()) {
          this.currentWorkingDirectory = path.resolve(newPath);
          this.sendTerminalMessage({
            type: "stdout",
            content: `Changed directory to: ${this.currentWorkingDirectory}\n`,
          });
          // 发送更新的工作目录给前端
          this.sendTerminalMessage({
            type: "cwd",
            content: this.currentWorkingDirectory,
          });
          this.sendTerminalMessage({
            type: "exit",
            content: "命令执行完成，退出码: 0",
          });
          return { handled: true };
        } else {
          this.sendTerminalMessage({
            type: "stderr",
            content: `cd: ${targetPath}: No such file or directory\n`,
          });
          this.sendTerminalMessage({
            type: "exit",
            content: "命令执行完成，退出码: 1",
          });
          return { handled: true };
        }
      } catch (err) {
        this.sendTerminalMessage({
          type: "stderr",
          content: `cd: ${(err as Error).message}\n`,
        });
        this.sendTerminalMessage({
          type: "exit",
          content: "命令执行完成，退出码: 1",
        });
        return { handled: true };
      }
    }

    // 处理 pwd 命令
    if (command.trim() === "pwd") {
      this.sendTerminalMessage({
        type: "stdout",
        content: `${this.currentWorkingDirectory}\n`,
      });
      this.sendTerminalMessage({
        type: "exit",
        content: "命令执行完成，退出码: 0",
      });
      return { handled: true };
    }

    // 处理 clear 命令
    if (command.trim() === "clear" || command.trim() === "cls") {
      this.sendTerminalMessage({
        type: "clear",
        content: "",
      });
      this.sendTerminalMessage({
        type: "exit",
        content: "命令执行完成，退出码: 0",
      });
      return { handled: true };
    }

    return { handled: false };
  }

  public runCommand(command = "") {
    // 如果有正在运行的进程，先终止它
    if (this.childProcess) {
      this.killCurrentProcess();
      this.sendTerminalMessage({
        type: "info",
        content: "Terminated current process to execute new command\n",
      });
      this.childProcess = null;
    }

    if (!command.trim()) {
      this.sendTerminalMessage({ type: "error", content: "Command cannot be empty\n" });
      return;
    }

    // 检查是否是内置命令
    const parseResult = this.parseCommand(command);
    if (parseResult.handled) {
      return;
    }

    // 根据操作系统选择合适的 shell
    const isWindows = os.platform() === "win32";
    const shell = isWindows ? "cmd.exe" : process.env.SHELL || "/bin/zsh";
    const shellArgs = isWindows ? ["/c", command] : ["-c", command];

    try {
      // 执行命令
      this.childProcess = spawn(shell, shellArgs, {
        detached: true,
        cwd: this.currentWorkingDirectory,
        stdio: "pipe",
        env: {
          ...process.env,
          PWD: this.currentWorkingDirectory, // 确保PWD环境变量正确
        },
        shell: false,
      });

      let hasOutput = false;

      // 处理标准输出
      this.childProcess.stdout?.on("data", (data) => {
        hasOutput = true;
        this.sendTerminalMessage({
          type: "stdout",
          content: data.toString(),
        });
      });

      // 处理错误输出
      this.childProcess.stderr?.on("data", (data) => {
        hasOutput = true;
        this.sendTerminalMessage({
          type: "stderr",
          content: data.toString(),
        });
      });

      // 处理命令完成事件
      this.childProcess.on("close", (code, signal) => {
        let exitMessage = `Process exited with code: ${code}`;
        if (signal) {
          exitMessage += `, signal: ${signal}`;
        }

        // 如果没有输出且命令成功执行，给出提示
        if (!hasOutput && code === 0) {
          this.sendTerminalMessage({
            type: "stdout",
            content: "Command executed successfully (no output)\n",
          });
        }

        this.sendTerminalMessage({
          type: "exit",
          content: exitMessage,
        });
        this.childProcess = null;
      });

      // 处理进程错误
      this.childProcess.on("error", (err) => {
        this.sendTerminalMessage({
          type: "error",
          content: `Failed to execute command: ${err.message}\n`,
        });
        this.childProcess = null;
      });
    } catch (err) {
      this.sendTerminalMessage({
        type: "error",
        content: `Failed to spawn process: ${(err as Error).message}\n`,
      });
    }
  }

  public getCurrentDirectory() {
    return this.currentWorkingDirectory;
  }

  public setWorkingDirectory(newPath: string) {
    if (existsSync(newPath) && statSync(newPath).isDirectory()) {
      this.currentWorkingDirectory = path.resolve(newPath);
      return true;
    }

    return false;
  }

  public killCurrentProcess() {
    if (this.childProcess) {
      if (this.childProcess.pid) {
        try {
          process.kill(-this.childProcess.pid, "SIGKILL"); // 负号表示终止整个进程组
          return true;
        } catch (error) {
          console.log("终止进程组失败，尝试终止单个进程");
          this.childProcess.kill("SIGKILL");
          return true;
        }
      }
    }
    return false;
  }

  public dispose() {
    // 清理子进程
    if (this.childProcess) {
      this.childProcess.kill("SIGTERM");
      this.childProcess = null;
    }
    this.sendTerminalMessage({ type: "close", content: "Terminal closed\n" });
  }
}

// 为了向后兼容，保留原有的工厂函数
export function createTerminal({
  sendTerminalMessage,
}: {
  sendTerminalMessage: (data: TerminalMessage) => void;
}) {
  return new Terminal({ sendTerminalMessage });
}
