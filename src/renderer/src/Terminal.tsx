import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "xterm/css/xterm.css";
import { VS_GO_EVENT } from "../../common/EVENT";

export function Terminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const currentInputRef = useRef<string>("");
  const commandHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const cursorPositionRef = useRef<number>(0);

  useEffect(() => {
    if (!terminalRef.current) return;

    // 创建 xterm 实例
    const terminal = new XTerm({
      theme: {
        background: "#1a1a1a",
        foreground: "#ffffff",
        cursor: "#ffffff",
        black: "#000000",
        red: "#cd3131",
        green: "#0dbc79",
        yellow: "#e5e510",
        blue: "#2472c8",
        magenta: "#bc3fbc",
        cyan: "#11a8cd",
        white: "#e5e5e5",
        brightBlack: "#666666",
        brightRed: "#f14c4c",
        brightGreen: "#23d18b",
        brightYellow: "#f5f543",
        brightBlue: "#3b8eea",
        brightMagenta: "#d670d6",
        brightCyan: "#29b8db",
        brightWhite: "#e5e5e5",
      },
      fontSize: 14,
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      cursorStyle: "block",
      cursorBlink: true,
      allowTransparency: false,
      scrollback: 1000,
    });

    // 添加插件
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    // 打开终端
    terminal.open(terminalRef.current);
    fitAddon.fit();

    // 保存引用
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // 显示欢迎信息
    terminal.writeln("\x1b[1;32m欢迎使用 VS Go 终端\x1b[0m");
    terminal.writeln("\x1b[90m正在连接到系统终端...\x1b[0m");
    terminal.writeln("");

    // 重置状态变量
    currentInputRef.current = "";
    commandHistoryRef.current = [];
    historyIndexRef.current = -1;
    cursorPositionRef.current = 0;

    // 显示提示符
    const showPrompt = () => {
      terminal.write("\x1b[1;34m$ \x1b[0m");
      cursorPositionRef.current = 0;
    };

    // 发送命令到主进程
    const sendCommand = (command: string) => {
      if (window.electron) {
        window.electron.ipcRenderer.send(VS_GO_EVENT.TERMINAL_RUN_COMMAND, command);
      }
    };

    // 监听来自主进程的数据
    const handleTerminalData = (e, data) => {
      const { type, data: content } = data;

      switch (type) {
        case "stdout":
          terminal.write(content);
          break;
        case "stderr":
          terminal.write(`\x1b[31m${content}\x1b[0m`);
          break;
        case "clear":
          terminal.clear();
          showPrompt();
          break;
        case "ready":
          terminal.writeln("\x1b[32m终端已就绪\x1b[0m");
          break;
        case "prompt":
          terminal.write(content);
          break;
        case "error":
          terminal.writeln(`\x1b[31m错误: ${content}\x1b[0m`);
          showPrompt();
          break;
        case "exit":
          terminal.writeln(`\x1b[33m${content}\x1b[0m`);
          break;
        default:
          terminal.write(content);
      }
    };
    window.electron.ipcRenderer.on(VS_GO_EVENT.TERMINAL_SEND_DATA, handleTerminalData);
    // 处理回车键
    const handleEnter = () => {
      const command = currentInputRef.current.trim();
      terminal.writeln("");

      if (command) {
        // 添加到命令历史
        commandHistoryRef.current.push(command);
        if (commandHistoryRef.current.length > 50) {
          commandHistoryRef.current.shift();
        }

        // 发送命令到主进程
        sendCommand(command);
      } else {
        showPrompt();
      }

      currentInputRef.current = "";
      historyIndexRef.current = -1;
      cursorPositionRef.current = 0;
    };

    // 处理退格键
    const handleBackspace = () => {
      if (cursorPositionRef.current > 0) {
        const pos = cursorPositionRef.current;
        currentInputRef.current =
          currentInputRef.current.slice(0, pos - 1) + currentInputRef.current.slice(pos);
        cursorPositionRef.current--;
        terminal.write("\b \b");

        // 重新显示光标后的文本
        if (cursorPositionRef.current < currentInputRef.current.length) {
          const remainingText = currentInputRef.current.slice(cursorPositionRef.current);
          terminal.write(remainingText + " ");
          // 移动光标回到正确位置
          for (let i = 0; i <= remainingText.length; i++) {
            terminal.write("\b");
          }
        }
      }
    };

    // 处理历史命令导航
    const handleHistoryNavigation = (direction: "up" | "down") => {
      if (commandHistoryRef.current.length === 0) return;

      // 清除当前输入行
      for (let i = 0; i < currentInputRef.current.length; i++) {
        terminal.write("\b \b");
      }

      if (direction === "up") {
        if (historyIndexRef.current === -1) {
          historyIndexRef.current = commandHistoryRef.current.length - 1;
        } else if (historyIndexRef.current > 0) {
          historyIndexRef.current--;
        }
      } else {
        if (historyIndexRef.current < commandHistoryRef.current.length - 1) {
          historyIndexRef.current++;
        } else {
          historyIndexRef.current = -1;
          currentInputRef.current = "";
          cursorPositionRef.current = 0;
          return;
        }
      }

      currentInputRef.current = commandHistoryRef.current[historyIndexRef.current] || "";
      cursorPositionRef.current = currentInputRef.current.length;
      terminal.write(currentInputRef.current);
    };

    // 键盘事件处理
    terminal.onKey(({ key, domEvent }) => {
      const code = domEvent.code;

      if (code === "Enter") {
        handleEnter();
      } else if (code === "Backspace") {
        handleBackspace();
      } else if (code === "ArrowUp") {
        domEvent.preventDefault();
        handleHistoryNavigation("up");
      } else if (code === "ArrowDown") {
        domEvent.preventDefault();
        handleHistoryNavigation("down");
      } else if (code === "ArrowLeft") {
        if (cursorPositionRef.current > 0) {
          cursorPositionRef.current--;
          terminal.write("\b");
        }
      } else if (code === "ArrowRight") {
        if (cursorPositionRef.current < currentInputRef.current.length) {
          terminal.write(currentInputRef.current[cursorPositionRef.current]);
          cursorPositionRef.current++;
        }
      } else if (code === "Home") {
        while (cursorPositionRef.current > 0) {
          cursorPositionRef.current--;
          terminal.write("\b");
        }
      } else if (code === "End") {
        while (cursorPositionRef.current < currentInputRef.current.length) {
          terminal.write(currentInputRef.current[cursorPositionRef.current]);
          cursorPositionRef.current++;
        }
      } else if (key.length === 1 && !domEvent.ctrlKey && !domEvent.altKey && !domEvent.metaKey) {
        // 插入字符
        const pos = cursorPositionRef.current;
        currentInputRef.current =
          currentInputRef.current.slice(0, pos) + key + currentInputRef.current.slice(pos);
        cursorPositionRef.current++;

        terminal.write(key);

        // 如果不在行尾，需要重新显示后面的字符
        if (cursorPositionRef.current <= currentInputRef.current.length - 1) {
          const remainingText = currentInputRef.current.slice(cursorPositionRef.current);
          terminal.write(remainingText);
          // 移动光标回到正确位置
          for (let i = 0; i < remainingText.length; i++) {
            terminal.write("\b");
          }
        }
      }
    });

    // 处理窗口大小变化
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);

      window.electron.ipcRenderer.removeAllListeners(VS_GO_EVENT.TERMINAL_SEND_DATA);

      terminal.dispose();
    };
  }, []);

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div ref={terminalRef} className="flex-1 p-2" style={{ minHeight: 0 }} />
    </div>
  );
}
