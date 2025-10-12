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
      // 根据操作系统选择合适的shell
      const shell = process.platform === 'win32' ? 'cmd.exe' : 
                   process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash';
      
      this.process = spawn(shell, [], {
        cwd: this.currentDirectory,
        env: process.env,
      });

      if (this.process.stdout) {
        this.process.stdout.on('data', (data) => {
          const output = data.toString();
          this.sendToRenderer('stdout', output);
          
          // 如果输出包含提示符特征，发送新的提示符
          if (output.includes('$') || output.includes('#') || output.endsWith('% ')) {
            setTimeout(() => this.sendPrompt(), 100);
          }
        });
      }

      if (this.process.stderr) {
        this.process.stderr.on('data', (data) => {
          this.sendToRenderer('stderr', data.toString());
        });
      }

      this.process.on('exit', (code) => {
        this.sendToRenderer('exit', `进程退出，退出码: ${code}`);
        // 重新启动shell
        setTimeout(() => this.startShell(), 1000);
      });

      this.process.on('error', (error) => {
        this.sendToRenderer('error', `错误: ${error.message}`);
      });

      // 发送初始提示和提示符
      this.sendToRenderer('ready', '终端已就绪');
      this.sendPrompt();
      
    } catch (error) {
      console.error('启动终端失败:', error);
      this.sendToRenderer('error', `启动终端失败: ${error}`);
    }
  }

  private executeCommand(command: string) {
    if (!this.process || !this.process.stdin) {
      this.sendToRenderer('error', '终端进程未就绪');
      return;
    }

    try {
      // 处理特殊命令
      const trimmedCommand = command.trim();
      
      if (trimmedCommand.startsWith('cd ')) {
        this.handleCdCommand(trimmedCommand);
        return;
      }

      if (trimmedCommand === 'clear' || trimmedCommand === 'cls') {
        this.sendToRenderer('clear', '');
        return;
      }

      // 执行普通命令
      this.process.stdin.write(command + '\n');
      
    } catch (error) {
      this.sendToRenderer('error', `执行命令失败: ${error}`);
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
    const prompt = `${this.currentDirectory.replace(os.homedir(), '~')} $ `;
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
    titleBarStyle: 'hiddenInset',
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
