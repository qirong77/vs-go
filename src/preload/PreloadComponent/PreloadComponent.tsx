import React, { useCallback, useEffect, useState, useRef } from "react";
import { debounce } from "../../common/debounce";
import { VS_GO_EVENT } from "../../common/EVENT";
import { ipcRenderer } from "electron";
import { BrowserItem } from "../../main/electron/store";
import { styles } from "./PreloadComponentStyle";
import { BackIcon, ForwardIcon, RefreshIcon } from "./Icon";
import {
  HistoryDropdownProps,
  NavigationButtonProps,
  UrlInputProps,
  UrlToolBarProps,
} from "./PreloadComponentType";
import { ExtensionCookie } from "./ExtensionComponents/ExtensionCookie";
import { ExtensionNote } from "./ExtensionComponents/ExtensionNote";
const INPUT_ID = 'preload-component-input"';
const MAX_DROPDOWN_ITEMS = 20; // 最大显示的下拉项数

// 主预加载组件
const PreLoadComponent: React.FC = () => {
  const [historyList, setHistoryList] = React.useState<BrowserItem[]>([]);
  const [currentUrl, setCurrentUrl] = useState<string>(window.location.href);
  const [showPreloadComponent, setShowPreloadComponent] = useState<boolean>(true);
  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [canGoForward, setCanGoForward] = useState<boolean>(false);
  const [isScrolled, setIsScrolled] = useState<boolean>(false);
  useCustomStyleInjector();
  const searchHistory = useCallback(
    debounce((value = "") => {
      ipcRenderer
        .invoke(VS_GO_EVENT.FLOATING_WINDOW_SEARCH_URL, value)
        .then((response: BrowserItem[]) => {
          setHistoryList(response.sort((a, b) => (b?.lastVisit ?? 0) - (a?.lastVisit ?? 0)) || []);
        });
    }, 100),
    []
  );

  useEffect(() => {
    const handleDevToolsShortKey = (e: KeyboardEvent) => {
      if (e.key === "F12" || (e.key === "I" && e.ctrlKey && e.altKey)) {
        ipcRenderer.send(VS_GO_EVENT.FLOATING_WINDOW_TOGGLE_DEVTOOLS);
      }
      if (e.key === "Escape") {
        setShowPreloadComponent((pre) => {
          if (!pre) {
            setTimeout(() => {
              const inputElement = document.getElementById(INPUT_ID) as HTMLInputElement | null;
              inputElement?.focus();
            }, 100);
          }
          return !pre;
        });
      }
    };

    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      setIsScrolled(scrollTop > 0);
    };

    document.addEventListener("keydown", handleDevToolsShortKey);
    window.addEventListener("scroll", handleScroll);

    // 初始化搜索历史
    searchHistory();

    return () => {
      document.removeEventListener("keydown", handleDevToolsShortKey);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [searchHistory]);

  const handleNavigation = useCallback((action: "back" | "forward") => {
    // 使用IPC通信来处理导航，而不是直接操作window.history
    ipcRenderer.send(VS_GO_EVENT.FLOATING_WINDOW_NAVIGATION, action);
  }, []);

  const handleUrlSearch = useCallback(
    (searchTerm: string) => {
      searchHistory(searchTerm);
    },
    [searchHistory]
  );
  useEffect(() => {
    ipcRenderer.on(VS_GO_EVENT.FLOATING_WINDOW_UPDATE_TARGET_URL, (_event, url: string) => {
      setCurrentUrl(url);
    });

    // 监听导航状态变化
    ipcRenderer.on(
      "navigation-state-changed",
      (_event, { canGoBack, canGoForward, url }: { canGoBack: boolean; canGoForward: boolean; url: string }) => {
        setCurrentUrl(url);
        setCanGoBack(canGoBack);
        setCanGoForward(canGoForward);
      }
    );

    return () => {
      ipcRenderer.removeAllListeners(VS_GO_EVENT.FLOATING_WINDOW_UPDATE_TARGET_URL);
      ipcRenderer.removeAllListeners("navigation-state-changed");
    };
  }, []);
  return (
    <div
      style={{
        ...styles.container,
        display: showPreloadComponent ? "block" : "none",
        boxShadow: isScrolled ? "0 4px 12px 0 rgb(0 0 0 / 0.15)" : "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        // 添加CSS重置，防止被宿主页面样式干扰
        margin: 0,
        padding: 0,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontSize: "14px",
        lineHeight: "1.5",
        color: "#374151",
      }}
    >
      <UrlToolBar
        canGoBack={canGoBack}
        onUrlChange={setCurrentUrl}
        canGoForward={canGoForward}
        onNavigation={handleNavigation}
        currentUrl={currentUrl}
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
  onUrlSearch,
  historyList,
  onUrlChange,
}: UrlToolBarProps) {
  return (
    <div style={styles.toolbar}>
      <div style={styles.navigationGroup}>
        <NavigationButton
          onClick={() => onNavigation("back")}
          disabled={!canGoBack}
          icon={<BackIcon size={16} />}
          title="后退"
        />
        <NavigationButton
          onClick={() => onNavigation("forward")}
          disabled={!canGoForward}
          icon={<ForwardIcon size={16} />}
          title="前进"
        />
        <NavigationButton
          onClick={() => {
            window.location.reload();
          }}
          icon={<RefreshIcon size={16} />}
          title="刷新"
        />
      </div>
      <UrlInput
        value={currentUrl}
        onChange={(url) => {
          onUrlChange(url);
        }}
        onSearch={onUrlSearch}
        historyList={historyList}
      />
      <div style={styles.extensionContainer}>
        <ExtensionCookie />
        <ExtensionNote />
      </div>
    </div>
  );
}

// 导航按钮组件
function NavigationButton({
  onClick,
  disabled = false,
  icon,
  title,
  style,
}: NavigationButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isActive, setIsActive] = useState(false);

  const getButtonStyle = () => {
    if (disabled) {
      return { ...styles.button, ...styles.buttonDisabled };
    }

    let buttonStyle = { ...styles.button };
    if (isActive) {
      buttonStyle = { ...buttonStyle, ...styles.buttonActive };
    } else if (isHovered) {
      buttonStyle = { ...buttonStyle, ...styles.buttonHover };
    }

    return buttonStyle;
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{ ...getButtonStyle(), ...style }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={() => setIsActive(true)}
      onMouseUp={() => setIsActive(false)}
    >
      {icon}
    </button>
  );
}

// URL输入框组件
function UrlInput({ value, onChange, onSearch, historyList }: UrlInputProps) {
  const [inputValue, setInputValue] = useState<string>(value);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
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
  useEffect(() => {
    setSelectedIndex(0);
  }, [historyList]);
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setSearchTerm(newValue);
    debouncedSearch(newValue);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const filteredHistory = historyList
      .filter(
        (item) =>
          searchTerm === "" ||
          item.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.name && item.name.toLowerCase().includes(searchTerm.toLowerCase()))
      )
      .slice(0, MAX_DROPDOWN_ITEMS); // 限制最大显示项数

    if (e.key === "Enter") {
      if (selectedIndex >= 0 && selectedIndex < filteredHistory.length && isFocused) {
        // 如果有选中的历史记录，使用选中的URL
        const selectedUrl = filteredHistory[selectedIndex].url;
        ipcRenderer.send(VS_GO_EVENT.FLOATING_WINDOW_CREATE, { url: selectedUrl });
        return;
      }
      if (inputValue.trim()) {
        ipcRenderer.send(VS_GO_EVENT.FLOATING_WINDOW_CREATE, { url: inputValue.trim() });
        setIsFocused(false);
        setSelectedIndex(-1);
        return;
      }
    }
    if (e.key === "Escape") {
      setIsFocused(false);
      setInputValue(value);
      setSelectedIndex(-1);
      return;
    }
    if (e.key === "ArrowDown" && isFocused) {
      e.preventDefault();
      const newIndex = selectedIndex < filteredHistory.length - 1 ? selectedIndex + 1 : 0;
      setSelectedIndex(newIndex);
      return;
    }
    if (e.key === "ArrowUp" && isFocused) {
      e.preventDefault();
      const newIndex = selectedIndex > 0 ? selectedIndex - 1 : filteredHistory.length - 1;
      setSelectedIndex(newIndex);
      return;
    }
    if (e.metaKey && e.key === "a") {
      // macOS 下的 Command + A 全选
      e.preventDefault();
      inputRef.current?.select();
      return;
    }
    if (e.ctrlKey && e.key === "a") {
      // Windows/Linux 下的 Ctrl + A 全选
      e.preventDefault();
      inputRef.current?.select();
      return;
    }
    onChange(inputValue);
  };

  const handleFocus = () => {
    setIsFocused(true);
    setSelectedIndex(-1); // 重置选中索引
    onSearch(""); // 获取所有历史记录
  };

  const handleBlur = () => {
    onChange(window.location.href);
    // 延迟关闭下拉列表，允许点击选择
    setTimeout(() => {
      setIsFocused(false);
      setSelectedIndex(0);
    }, 150);
  };

  const handleHistorySelect = (url: string) => {
    // setInputValue(url);
    // onChange(url);
    setIsFocused(false);
    setSelectedIndex(0);
    ipcRenderer.send(VS_GO_EVENT.FLOATING_WINDOW_CREATE, { url });
  };

  const handleSelectedIndexChange = (index: number) => {
    setSelectedIndex(index);
  };

  const getInputStyle = () => {
    let inputStyle = { ...styles.input };
    if (isFocused) {
      inputStyle = { ...inputStyle, ...styles.inputFocused };
    } else if (isHovered) {
      inputStyle = { ...inputStyle, ...styles.inputHover };
    }
    return inputStyle;
  };

  const getInputContainerStyle = () => {
    let containerStyle = { ...styles.inputContainer };
    if (isHovered && !isFocused) {
      containerStyle = { ...containerStyle, ...styles.inputContainerHover };
    }
    return containerStyle;
  };

  return (
    <div
      style={getInputContainerStyle()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={styles.inputWrapper}>
        <input
          ref={inputRef}
          type="text"
          id={INPUT_ID}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyPress}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="输入网址或搜索..."
          style={getInputStyle()}
        />
        <HistoryDropdown
          isVisible={isFocused}
          historyList={historyList}
          onSelect={handleHistorySelect}
          searchTerm={searchTerm}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={handleSelectedIndexChange}
        />
      </div>
    </div>
  );
}

// 历史记录下拉列表组件
function HistoryDropdown({
  isVisible,
  historyList,
  onSelect,
  searchTerm,
  selectedIndex,
  onSelectedIndexChange,
}: HistoryDropdownProps) {
  if (!isVisible || !historyList.length) {
    return null;
  }

  // 过滤历史记录
  const filteredHistory = historyList
    .filter(
      (item) =>
        searchTerm === "" ||
        item.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.name && item.name.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .slice(0, MAX_DROPDOWN_ITEMS);

  return (
    <div style={styles.dropdown}>
      {filteredHistory.length === 0 ? (
        <div style={styles.emptyState}>{searchTerm ? "未找到匹配的历史记录" : "暂无历史记录"}</div>
      ) : (
        filteredHistory.map((item, index) => (
          <HistoryDropdownItem
            key={`${item.url}-${index}`}
            item={item}
            onSelect={onSelect}
            isLast={index === filteredHistory.length - 1}
            isSelected={index === selectedIndex}
            onMouseEnter={() => onSelectedIndexChange(index)}
          />
        ))
      )}
    </div>
  );
}

// 历史记录下拉列表项组件
function HistoryDropdownItem({
  item,
  onSelect,
  isLast,
  isSelected,
  onMouseEnter,
}: {
  item: BrowserItem;
  onSelect: (url: string) => void;
  isLast: boolean;
  isSelected?: boolean;
  onMouseEnter?: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  const getItemStyle = () => {
    let itemStyle = { ...styles.dropdownItem };
    if (isLast) {
      itemStyle = { ...itemStyle, ...styles.dropdownItemLast };
    }
    if (isSelected || isHovered) {
      itemStyle = { ...itemStyle, ...styles.dropdownItemHover };
    }
    return itemStyle;
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    onMouseEnter?.();
  };

  return (
    <div
      style={getItemStyle()}
      id={`history-dropdown-item-${item.url}`}
      onClick={() => onSelect(item.url)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={styles.dropdownItemContent}>
        <div style={styles.dropdownIcon}>
          <span>🌐</span>
        </div>
        <div style={styles.dropdownText}>
          <div style={styles.dropdownTitle}>{item.name || item.url}</div>
          <div style={styles.dropdownUrl}>{item.url}</div>
        </div>
      </div>
    </div>
  );
}
/* 
自定义样式注入器，解决宿主页面样式冲突问题
*/
function useCustomStyleInjector() {
  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
    #main {
      margin-top: 220px !important;
    }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);
  return null;
}

export default PreLoadComponent;
