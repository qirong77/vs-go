import { useEffect, useState, useRef, useCallback } from "react";
import { VS_GO_EVENT } from "../../common/EVENT";
import AnsiToHtml from "ansi-to-html";

interface TerminalMessage {
  type: string;
  content?: string;
  timestamp: number;
}

const TerminalOutput = ({ messages }: { messages: TerminalMessage[] }) => {
  const outputRef = useRef<HTMLDivElement>(null);

  // 初始化转换器（可自定义主题）
  const ansiConverter = new AnsiToHtml({
    newline: true, // 自动将 \n 转为 <br>
    escapeXML: true, // 转义 HTML 特殊字符（防 XSS）
    colors: {
      0: "#000000",
      1: "#ff0000",
      2: "#00ff00",
      3: "#ffff00",
      4: "#0000ff",
      5: "#ff00ff",
      6: "#00ffff",
      7: "#ffffff",
    },
  });

  // 自动滚动到底部
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [messages]);

  const getTypeColor = (type: string) => {
    switch (type) {
      case "command":
        return "text-blue-400";
      case "stderr":
        return "text-red-400";
      case "error":
        return "text-red-500";
      case "info":
        return "text-yellow-400";
      case "exit":
        return "text-gray-400";
      default:
        return "text-green-300";
    }
  };

  const getTypePrefix = (type: string) => {
    switch (type) {
      case "command":
        return "❯ ";
      case "stderr":
        return "✗ ";
      case "error":
        return "✗ ";
      case "info":
        return "ⓘ ";
      case "exit":
        return "✓ ";
      default:
        return "";
    }
  };

  return (
    <div
      ref={outputRef}
      className="terminal-output flex-1 overflow-y-auto p-4 font-mono text-sm bg-gray-900 text-green-300"
    >
      {messages.map((message, index) => {
        const htmlContent = message.content ? ansiConverter.toHtml(message.content) : "";
        return (
          <div key={index} className={`mb-1 ${getTypeColor(message.type)}`}>
            <span className="opacity-70">{getTypePrefix(message.type)}</span>
            <span dangerouslySetInnerHTML={{ __html: htmlContent }} />
          </div>
        );
      })}
    </div>
  );
};

export function Terminal() {
  const [messages, setMessages] = useState<TerminalMessage[]>([]);
  const [currentCommand, setCurrentCommand] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentWorkingDirectory, setCurrentWorkingDirectory] = useState("~");
  const inputRef = useRef<HTMLInputElement>(null);

  // 格式化路径显示
  const formatPath = useCallback((path: string) => {
    // 简单的路径缩短逻辑
    if (path.includes("/Users/")) {
      const parts = path.split("/");
      const userIndex = parts.indexOf("Users");
      if (userIndex !== -1 && userIndex + 1 < parts.length) {
        const remainingPath = parts.slice(userIndex + 2).join("/");
        return remainingPath ? `~/${remainingPath}` : "~";
      }
    }
    return path;
  }, []);

  const addMessage = useCallback((type: string, content: string) => {
    setMessages((prev) => [...prev, { type, content, timestamp: Date.now() }]);
  }, []);

  const clearTerminal = useCallback(() => {
    setMessages([]);
  }, []);

  const interruptCommand = useCallback(() => {
    if (isExecuting) {
      window.electron.ipcRenderer.send(VS_GO_EVENT.TERMINAL_INTERRUPT);
    }
  }, [isExecuting]);

  const executeCommand = useCallback(
    (command: string) => {
      if (!command.trim()) return;
      setIsExecuting(true);
      addMessage("command", command);

      // 添加到历史记录
      setCommandHistory((prev) => {
        const newHistory = [command, ...prev.filter((cmd) => cmd !== command)];
        return newHistory.slice(0, 100); // 保留最近100条命令
      });

      // 发送命令到主进程
      window.electron.ipcRenderer.send(VS_GO_EVENT.TERMINAL_RUN_COMMAND, command);

      setCurrentCommand("");
      setHistoryIndex(-1);
    },
    [isExecuting, addMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        executeCommand(currentCommand);
        window.requestIdleCallback(() => {
          inputRef.current?.focus();
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (historyIndex < commandHistory.length - 1) {
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          setCurrentCommand(commandHistory[newIndex]);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setCurrentCommand(commandHistory[newIndex]);
        } else if (historyIndex === 0) {
          setHistoryIndex(-1);
          setCurrentCommand("");
        }
      } else if (e.key === "Tab") {
        e.preventDefault();
        // TODO: 实现命令自动补全
      } else if (e.key === "c" && (e.ctrlKey || e.metaKey)) {
        if (isExecuting) {
          e.preventDefault();
          interruptCommand();
        }
      } else if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        clearTerminal();
      }
    },
    [
      currentCommand,
      executeCommand,
      commandHistory,
      historyIndex,
      isExecuting,
      interruptCommand,
      clearTerminal,
    ]
  );

  const getCurrentDirectory = useCallback(() => {
    window.electron.ipcRenderer.send(VS_GO_EVENT.TERMINAL_GET_CWD);
  }, []);

  useEffect(() => {
    const handleTerminalData = (_e: any, data: any) => {
      const { type, content } = data;

      if (type === "clear") {
        clearTerminal();
        return;
      }

      if (type === "cwd") {
        setCurrentWorkingDirectory(content || "~");
        return;
      }

      addMessage(type, content || "");

      if (type === "exit" || type === "error") {
        window.requestIdleCallback(() => {
          inputRef.current?.focus();
        });
        setIsExecuting(false);
      }
    };

    window.electron.ipcRenderer.on(VS_GO_EVENT.TERMINAL_SEND_DATA, handleTerminalData);
    // 获取当前工作目录
    setTimeout(() => {
      getCurrentDirectory();
    }, 100);

    return () => {
      window.electron.ipcRenderer.removeAllListeners(VS_GO_EVENT.TERMINAL_SEND_DATA);
    };
  }, [addMessage, clearTerminal, getCurrentDirectory]);

  // 自动聚焦输入框
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  return (
    <div
      className="h-full flex flex-col bg-gray-900 text-green-300"
      onClick={() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
          inputRef.current?.focus();
        }
      }}
    >
      <style>{`
      #root {
      height: 100vh;
      }
      `}</style>
      {/* 终端输出区域 */}
      <TerminalOutput messages={messages} />

      {/* 命令输入区域 */}
      <div className="flex items-center px-4 py-2 bg-gray-800 border-t border-gray-700">
        <div className="flex items-center text-sm font-mono mr-2">
          <span className="text-gray-400">{formatPath(currentWorkingDirectory)}</span>
          <span className="text-blue-400 ml-1">❯</span>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={currentCommand}
          onChange={(e) => setCurrentCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isExecuting ? "Command running..." : "Type a command and press Enter"}
          className="flex-1 bg-transparent text-green-300 font-mono text-sm outline-none placeholder-gray-500 disabled:opacity-50"
        />
        <div className="flex items-center space-x-2 ml-2">
          <div className="flex items-center space-x-2">
            <button
              onClick={clearTerminal}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
            >
              Clear
            </button>
          </div>
          <button
            onClick={() => executeCommand(currentCommand)}
            disabled={!currentCommand.trim()}
            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:opacity-50 rounded text-white transition-colors"
          >
            Run
          </button>
          {isExecuting && (
            <button
              onClick={interruptCommand}
              className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 rounded text-white"
            >
              ⏹
            </button>
          )}
        </div>
      </div>

      {/* 快捷键提示 */}
      <div className="px-4 py-1 bg-gray-800 text-xs text-gray-500 border-t border-gray-700">
        <span className="mr-4">↑↓ History</span>
        <span className="mr-4">Enter Execute</span>
        <span className="mr-4">Ctrl+C Interrupt</span>
        <span className="mr-4">Ctrl+L Clear</span>
        <span>Tab Complete (Coming soon)</span>
      </div>
    </div>
  );
}
