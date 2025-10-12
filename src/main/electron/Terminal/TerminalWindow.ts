import { is } from "@electron-toolkit/utils";
import { BrowserWindow, ipcMain } from "electron";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import * as os from "os";
import { VS_GO_EVENT } from "../../../common/EVENT";

class TerminalManager {
  private process: ChildProcess | null = null;
  private window: BrowserWindow | null = null;
  private currentDirectory: string = os.homedir();

  constructor(window: BrowserWindow) {
    this.window = window;
    this.setupEventHandlers();
    this.startShell();
  }

  private setupEventHandlers() {
    if (!this.window) return;

    // 监听来自渲染进程的命令
    ipcMain.on(VS_GO_EVENT.TERMINAL_RUN_COMMAND, (event, command: string) => {
      if (event.sender === this.window?.webContents) {
        this.executeCommand(command);
      }
    });

    // 窗口关闭时清理
    this.window.on('closed', () => {
      this.cleanup();
    });
  }

  private startShell() {
    try {
      // 不启动持续的shell进程，而是按需执行命令
      this.process = null;
      
      // 发送初始提示
      this.sendToRenderer('ready', '终端已就绪');
      this.sendPrompt();
      
    } catch (error) {
      console.error('启动终端失败:', error);
      this.sendToRenderer('error', `启动终端失败: ${error}`);
    }
  }

  private executeCommand(command: string) {
    const trimmedCommand = command.trim();
    
    // 处理特殊命令
    if (trimmedCommand.startsWith('cd ')) {
      this.handleCdCommand(trimmedCommand);
      return;
    }

    if (trimmedCommand === 'clear' || trimmedCommand === 'cls') {
      this.sendToRenderer('clear', '');
      return;
    }

    if (!trimmedCommand) {
      this.sendPrompt();
      return;
    }

    try {
      // 使用shell执行完整命令，保持原始格式
      const shell = process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash';
      const commandProcess = spawn(shell, ['-c', trimmedCommand], {
        cwd: this.currentDirectory,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          FORCE_COLOR: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      commandProcess.stdout?.setEncoding('utf8');
      commandProcess.stderr?.setEncoding('utf8');

      commandProcess.stdout?.on('data', (data) => {
        stdout += data;
      });

      commandProcess.stderr?.on('data', (data) => {
        stderr += data;
      });

      commandProcess.on('close', (code) => {
        // 发送完整输出
        if (stdout) {
          this.sendToRenderer('stdout', stdout);
        }
        if (stderr) {
          this.sendToRenderer('stderr', stderr);
        } else if (code !== 0) {
          this.sendToRenderer('stderr', `命令退出码: ${code}\n`);
        }
        
        // 总是发送新的提示符
        this.sendPrompt();
      });

      commandProcess.on('error', (err) => {
        this.sendToRenderer('stderr', `bash: ${trimmedCommand}: 命令未找到 - ${err.message}\n`);
        this.sendPrompt();
      });
      
    } catch (error) {
      this.sendToRenderer('stderr', `执行命令失败: ${error}\n`);
      this.sendPrompt();
    }
  }

  private handleCdCommand(command: string) {
    const targetDir = command.slice(3).trim();
    let newDir = targetDir;

    if (!targetDir || targetDir === '~') {
      newDir = os.homedir();
    } else if (!path.isAbsolute(targetDir)) {
      newDir = path.resolve(this.currentDirectory, targetDir);
    }

    try {
      const fs = require('fs');
      if (fs.existsSync(newDir) && fs.statSync(newDir).isDirectory()) {
        this.currentDirectory = newDir;
        
        // 重启shell到新目录
        if (this.process) {
          this.process.kill();
        }
        
        setTimeout(() => {
          this.startShell();
          this.sendToRenderer('stdout', `已切换到目录: ${this.currentDirectory}\n`);
          this.sendPrompt();
        }, 100);
      } else {
        this.sendToRenderer('stderr', `目录不存在: ${newDir}\n`);
      }
    } catch (error) {
      this.sendToRenderer('stderr', `切换目录失败: ${error}\n`);
    }
  }

  private sendToRenderer(type: string, data: string) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(VS_GO_EVENT.TERMINAL_SEND_DATA, {
        type,
        data,
        timestamp: Date.now()
      });
    }
  }

  private sendPrompt() {
    const shortenedPath = this.currentDirectory.replace(os.homedir(), '~');
    const prompt = `${shortenedPath} $ `;
    this.sendToRenderer('prompt', prompt);
  }

  private cleanup() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.window = null;
  }

  public getCurrentDirectory(): string {
    return this.currentDirectory;
  }

  public sendInput(input: string) {
    if (this.process && this.process.stdin) {
      this.process.stdin.write(input);
    }
  }
}

export function createTerminalWindow() {
  const window = new BrowserWindow({
    width: 1000,
    height: 700,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    window.loadURL(process.env["ELECTRON_RENDERER_URL"] + "/#/terminal");
  } else {
    window.loadFile(path.join(__dirname, "../renderer/index.html"), {
      hash: "/terminal",
    });
  }

  // 创建终端管理器
  new TerminalManager(window);

  return window;
}
