import React, { useCallback, useEffect, useState, useRef } from "react";
import { debounce } from "../common/debounce";
import { VS_GO_EVENT } from "../common/EVENT";
import { ipcRenderer } from "electron";
import { BrowserItem } from "../main/electron/store";

interface UrlToolBarProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onNavigation: (action: 'back' | 'forward' | 'refresh') => void;
  currentUrl: string;
  onUrlChange: (url: string) => void;
  onUrlSearch: (searchTerm: string) => void;
  historyList: BrowserItem[];
}

interface NavigationButtonProps {
  onClick: () => void;
  disabled?: boolean;
  icon: string;
  title: string;
}

interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (searchTerm: string) => void;
  historyList: BrowserItem[];
}

interface HistoryDropdownProps {
  isVisible: boolean;
  historyList: BrowserItem[];
  onSelect: (url: string) => void;
  searchTerm: string;
}

const PreLoadComponent: React.FC = () => {
  const [historyList, setHistoryList] = React.useState<BrowserItem[]>([]);
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [canGoBack] = useState<boolean>(false);
  const [canGoForward] = useState<boolean>(false);
  
  const searchHistory = useCallback((value = "") => {
    ipcRenderer.invoke(VS_GO_EVENT.FLOATING_WINDOW_SEARCH_URL, value).then((response) => {
      setHistoryList(response || []);
    });
  }, []);
  
  useEffect(() => {
    const handleDevToolsShortKey = (e: KeyboardEvent) => {
      if (e.key === "F12" || (e.key === "I" && e.ctrlKey && e.altKey)) {
        ipcRenderer.send(VS_GO_EVENT.FLOATING_WINDOW_TOGGLE_DEVTOOLS);
      }
    };
    document.addEventListener("keydown", handleDevToolsShortKey);
    
    // 初始化搜索历史
    searchHistory();
    
    return () => {
      document.removeEventListener("keydown", handleDevToolsShortKey);
    };
  }, [searchHistory]);

  const handleNavigation = useCallback((action: 'back' | 'forward' | 'refresh') => {
    // 这里应该调用相应的 IPC 事件来控制浏览器导航
    console.log(`Navigation action: ${action}`);
    // 示例 IPC 调用
    // ipcRenderer.send(VS_GO_EVENT.BROWSER_NAVIGATE, action);
  }, []);

  const handleUrlChange = useCallback((url: string) => {
    setCurrentUrl(url);
    // 这里应该调用相应的 IPC 事件来导航到新 URL
    console.log(`Navigate to: ${url}`);
    // 示例 IPC 调用
    // ipcRenderer.send(VS_GO_EVENT.BROWSER_LOAD_URL, url);
  }, []);

  const handleUrlSearch = useCallback((searchTerm: string) => {
    searchHistory(searchTerm);
  }, [searchHistory]);

  return (
    <div className="w-full bg-white border-b border-gray-200 shadow-sm">
      <UrlToolBar
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onNavigation={handleNavigation}
        currentUrl={currentUrl}
        onUrlChange={handleUrlChange}
        onUrlSearch={handleUrlSearch}
        historyList={historyList}
      />
    </div>
  );
};

// 主工具栏组件
function UrlToolBar({
  canGoBack,
  canGoForward,
  onNavigation,
  currentUrl,
  onUrlChange,
  onUrlSearch,
  historyList
}: UrlToolBarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="flex items-center gap-1">
        <NavigationButton
          onClick={() => onNavigation('back')}
          disabled={!canGoBack}
          icon="←"
          title="后退"
        />
        <NavigationButton
          onClick={() => onNavigation('forward')}
          disabled={!canGoForward}
          icon="→"
          title="前进"
        />
        <NavigationButton
          onClick={() => onNavigation('refresh')}
          icon="↻"
          title="刷新"
        />
      </div>
      <div className="flex-1">
        <UrlInput
          value={currentUrl}
          onChange={onUrlChange}
          onSearch={onUrlSearch}
          historyList={historyList}
        />
      </div>
    </div>
  );
}

// 导航按钮组件
function NavigationButton({ onClick, disabled = false, icon, title }: NavigationButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        w-8 h-8 flex items-center justify-center rounded-md text-sm font-medium
        transition-colors duration-200
        ${disabled 
          ? 'text-gray-400 cursor-not-allowed' 
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200'
        }
      `}
    >
      {icon}
    </button>
  );
}

// URL输入框组件
function UrlInput({ value, onChange, onSearch, historyList }: UrlInputProps) {
  const [inputValue, setInputValue] = useState<string>(value);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const debouncedSearch = useCallback(
    debounce((term: string) => {
      onSearch(term);
    }, 300),
    [onSearch]
  );

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setSearchTerm(newValue);
    debouncedSearch(newValue);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onChange(inputValue);
      setIsFocused(false);
    }
    if (e.key === 'Escape') {
      setIsFocused(false);
      setInputValue(value);
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    onSearch(""); // 获取所有历史记录
  };

  const handleBlur = () => {
    // 延迟关闭下拉列表，允许点击选择
    setTimeout(() => setIsFocused(false), 150);
  };

  const handleHistorySelect = (url: string) => {
    setInputValue(url);
    onChange(url);
    setIsFocused(false);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="输入网址或搜索..."
        className="
          w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
          bg-white
        "
      />
      <HistoryDropdown
        isVisible={isFocused}
        historyList={historyList}
        onSelect={handleHistorySelect}
        searchTerm={searchTerm}
      />
    </div>
  );
}

// 历史记录下拉列表组件
function HistoryDropdown({ isVisible, historyList, onSelect, searchTerm }: HistoryDropdownProps) {
  if (!isVisible || !historyList.length) {
    return null;
  }

  // 过滤历史记录
  const filteredHistory = historyList.filter(item => 
    searchTerm === "" || 
    item.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.name && item.name.toLowerCase().includes(searchTerm.toLowerCase()))
  ).slice(0, 8); // 最多显示8条

  return (
    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
      {filteredHistory.length === 0 ? (
        <div className="px-3 py-2 text-sm text-gray-500">
          {searchTerm ? "未找到匹配的历史记录" : "暂无历史记录"}
        </div>
      ) : (
        filteredHistory.map((item, index) => (
          <div
            key={`${item.url}-${index}`}
            onClick={() => onSelect(item.url)}
            className="
              px-3 py-2 cursor-pointer hover:bg-gray-100 border-b border-gray-100 last:border-b-0
              transition-colors duration-150
            "
          >
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-200 rounded-sm flex-shrink-0 flex items-center justify-center">
                <span className="text-xs">🌐</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {item.name || item.url}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {item.url}
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default PreLoadComponent;
