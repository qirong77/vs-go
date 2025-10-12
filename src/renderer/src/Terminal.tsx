import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import 'xterm/css/xterm.css';

export function Terminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // 创建 xterm 实例
    const terminal = new XTerm({
      theme: {
        background: '#1a1a1a',
        foreground: '#ffffff',
        cursor: '#ffffff',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5'
      },
      fontSize: 14,
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      cursorStyle: 'block',
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
    terminal.writeln('\x1b[1;32m欢迎使用 VS Go 终端\x1b[0m');
    terminal.writeln('\x1b[90m输入命令并按回车执行，所有命令都会返回当前时间\x1b[0m');
    terminal.writeln('\x1b[90m支持的命令: ls, pwd, date, whoami, clear, help, echo, cd\x1b[0m');
    terminal.writeln('');

    let currentInput = '';
    let commandHistory: string[] = [];
    let historyIndex = -1;
    let cursorPosition = 0;

    // 显示提示符
    const showPrompt = () => {
      terminal.write('\x1b[1;34m$ \x1b[0m');
      cursorPosition = 0;
    };

    // 执行命令的 mock 函数
    const executeCommand = (command: string): string => {
      const timestamp = new Date().toLocaleString('zh-CN');
      const trimmedCommand = command.trim().toLowerCase();

      if (!trimmedCommand) return '';

      const mockCommands: Record<string, string> = {
        'ls': `\x1b[36m文件列表 (${timestamp}):\x1b[0m\npackage.json\nsrc/\nbuild/\nREADME.md\nnode_modules/`,
        'pwd': `\x1b[36m当前目录 (${timestamp}):\x1b[0m\n/Users/developer/vs-go`,
        'date': `\x1b[36m当前时间:\x1b[0m ${timestamp}`,
        'whoami': `\x1b[36m当前用户 (${timestamp}):\x1b[0m developer`,
        'help': `\x1b[36m可用命令 (${timestamp}):\x1b[0m\n\x1b[33mls\x1b[0m     - 列出文件和目录\n\x1b[33mpwd\x1b[0m    - 显示当前工作目录\n\x1b[33mdate\x1b[0m   - 显示当前日期和时间\n\x1b[33mwhoami\x1b[0m - 显示当前用户名\n\x1b[33mclear\x1b[0m  - 清空终端屏幕\n\x1b[33mecho\x1b[0m   - 显示文本\n\x1b[33mcd\x1b[0m     - 切换目录\n\x1b[33mhelp\x1b[0m   - 显示此帮助信息`,
      };

      // 处理 echo 命令
      if (trimmedCommand.startsWith('echo ')) {
        const message = command.slice(5);
        return `\x1b[36m${message} (${timestamp})\x1b[0m`;
      }

      // 处理 cd 命令
      if (trimmedCommand.startsWith('cd ')) {
        const path = command.slice(3).trim();
        return `\x1b[36m已切换到目录: ${path} (${timestamp})\x1b[0m`;
      }

      // 处理 clear 命令
      if (trimmedCommand === 'clear') {
        return 'CLEAR';
      }

      return mockCommands[trimmedCommand] || `\x1b[31m命令未找到: ${command} (${timestamp})\x1b[0m\n输入 'help' 查看可用命令`;
    };

    // 处理回车键
    const handleEnter = () => {
      terminal.writeln('');
      
      if (currentInput.trim()) {
        const result = executeCommand(currentInput);
        
        if (result === 'CLEAR') {
          terminal.clear();
        } else {
          terminal.writeln(result);
        }
        
        // 添加到命令历史
        commandHistory.push(currentInput);
        if (commandHistory.length > 50) {
          commandHistory.shift();
        }
      }
      
      currentInput = '';
      historyIndex = -1;
      terminal.writeln('');
      showPrompt();
    };

    // 处理退格键
    const handleBackspace = () => {
      if (cursorPosition > 0) {
        currentInput = currentInput.slice(0, cursorPosition - 1) + currentInput.slice(cursorPosition);
        cursorPosition--;
        terminal.write('\b \b');
        
        // 重新显示光标后的文本
        if (cursorPosition < currentInput.length) {
          const remainingText = currentInput.slice(cursorPosition);
          terminal.write(remainingText + ' ');
          // 移动光标回到正确位置
          for (let i = 0; i <= remainingText.length; i++) {
            terminal.write('\b');
          }
        }
      }
    };

    // 处理历史命令导航
    const handleHistoryNavigation = (direction: 'up' | 'down') => {
      if (commandHistory.length === 0) return;

      // 清除当前输入行
      for (let i = 0; i < currentInput.length; i++) {
        terminal.write('\b \b');
      }

      if (direction === 'up') {
        if (historyIndex === -1) {
          historyIndex = commandHistory.length - 1;
        } else if (historyIndex > 0) {
          historyIndex--;
        }
      } else {
        if (historyIndex < commandHistory.length - 1) {
          historyIndex++;
        } else {
          historyIndex = -1;
          currentInput = '';
          cursorPosition = 0;
          return;
        }
      }

      currentInput = commandHistory[historyIndex] || '';
      cursorPosition = currentInput.length;
      terminal.write(currentInput);
    };

    // 键盘事件处理
    terminal.onKey(({ key, domEvent }) => {
      const code = domEvent.code;
      
      if (code === 'Enter') {
        handleEnter();
      } else if (code === 'Backspace') {
        handleBackspace();
      } else if (code === 'ArrowUp') {
        domEvent.preventDefault();
        handleHistoryNavigation('up');
      } else if (code === 'ArrowDown') {
        domEvent.preventDefault();
        handleHistoryNavigation('down');
      } else if (code === 'ArrowLeft') {
        if (cursorPosition > 0) {
          cursorPosition--;
          terminal.write('\b');
        }
      } else if (code === 'ArrowRight') {
        if (cursorPosition < currentInput.length) {
          terminal.write(currentInput[cursorPosition]);
          cursorPosition++;
        }
      } else if (code === 'Home') {
        while (cursorPosition > 0) {
          cursorPosition--;
          terminal.write('\b');
        }
      } else if (code === 'End') {
        while (cursorPosition < currentInput.length) {
          terminal.write(currentInput[cursorPosition]);
          cursorPosition++;
        }
      } else if (key.length === 1 && !domEvent.ctrlKey && !domEvent.altKey && !domEvent.metaKey) {
        // 插入字符
        currentInput = currentInput.slice(0, cursorPosition) + key + currentInput.slice(cursorPosition);
        cursorPosition++;
        
        terminal.write(key);
        
        // 如果不在行尾，需要重新显示后面的字符
        if (cursorPosition <= currentInput.length - 1) {
          const remainingText = currentInput.slice(cursorPosition);
          terminal.write(remainingText);
          // 移动光标回到正确位置
          for (let i = 0; i < remainingText.length; i++) {
            terminal.write('\b');
          }
        }
      }
    });

    // 显示初始提示符
    showPrompt();

    // 处理窗口大小变化
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      terminal.dispose();
    };
  }, []);

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* 终端头部 */}
      <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <span className="text-gray-300 text-sm">终端 - VS Go</span>
        </div>
      </div>

      {/* XTerm 容器 */}
      <div 
        ref={terminalRef} 
        className="flex-1 p-2"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}