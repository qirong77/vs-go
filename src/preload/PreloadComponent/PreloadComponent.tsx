import React, { useCallback, useEffect, useState, useRef } from "react";
import { debounce } from "../../common/debounce";
import { VS_GO_EVENT } from "../../common/EVENT";
import { ipcRenderer } from "electron";
import { BrowserItem } from "../../main/electron/store";
import { styles } from "./PreloadComponentStyle";
import {
  HistoryDropdownProps,
  NavigationButtonProps,
  UrlInputProps,
  UrlToolBarProps,
} from "./PreloadComponentType";

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

  const handleNavigation = useCallback((action: "back" | "forward" | "refresh") => {
    switch(action) {
      case 'back':
        break;
      case 'forward':
        break;
      case 'refresh':
        window.location.reload()
        break;
    }
  }, []);

  const handleUrlChange = useCallback((url: string) => {
    setCurrentUrl(url);
    ipcRenderer.send(VS_GO_EVENT.FLOATING_WINDOW_CREATE, url);
  }, []);

  const handleUrlSearch = useCallback(
    (searchTerm: string) => {
      searchHistory(searchTerm);
    },
    [searchHistory]
  );

  return (
    <div style={styles.container}>
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
  historyList,
}: UrlToolBarProps) {
  return (
    <div style={styles.toolbar}>
      <div style={styles.navigationGroup}>
        <NavigationButton
          onClick={() => onNavigation("back")}
          disabled={!canGoBack}
          icon="←"
          title="后退"
        />
        <NavigationButton
          onClick={() => onNavigation("forward")}
          disabled={!canGoForward}
          icon="→"
          title="前进"
        />
        <NavigationButton onClick={() => onNavigation("refresh")} icon="↻" title="刷新" style={{
          fontSize:'20px'
        }}/>
      </div>
      <div style={styles.inputContainer}>
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
function NavigationButton({ onClick, disabled = false, icon, title,style }: NavigationButtonProps) {
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
      .slice(0, 8);

    if (e.key === "Enter") {
      if (selectedIndex >= 0 && selectedIndex < filteredHistory.length && isFocused) {
        // 如果有选中的历史记录，使用选中的URL
        const selectedUrl = filteredHistory[selectedIndex].url;
        setInputValue(selectedUrl);
        onChange(selectedUrl);
      } else {
        // 否则使用当前输入值
        onChange(inputValue);
      }
      setIsFocused(false);
      setSelectedIndex(-1);
    } else if (e.key === "Escape") {
      setIsFocused(false);
      setInputValue(value);
      setSelectedIndex(-1);
    } else if (e.key === "ArrowDown" && isFocused) {
      e.preventDefault();
      const newIndex = selectedIndex < filteredHistory.length - 1 ? selectedIndex + 1 : 0;
      setSelectedIndex(newIndex);
    } else if (e.key === "ArrowUp" && isFocused) {
      e.preventDefault();
      const newIndex = selectedIndex > 0 ? selectedIndex - 1 : filteredHistory.length - 1;
      setSelectedIndex(newIndex);
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    setSelectedIndex(-1); // 重置选中索引
    onSearch(""); // 获取所有历史记录
  };

  const handleBlur = () => {
    // 延迟关闭下拉列表，允许点击选择
    setTimeout(() => {
      setIsFocused(false);
      setSelectedIndex(-1);
    }, 150);
  };

  const handleHistorySelect = (url: string) => {
    setInputValue(url);
    onChange(url);
    setIsFocused(false);
    setSelectedIndex(-1);
  };

  const handleSelectedIndexChange = (index: number) => {
    setSelectedIndex(index);
  };

  const getInputStyle = () => {
    let inputStyle = { ...styles.input };
    if (isFocused) {
      inputStyle = { ...inputStyle, ...styles.inputFocused };
    }
    return inputStyle;
  };

  return (
    <div style={styles.inputWrapper}>
      <input
        ref={inputRef}
        type="text"
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
  );
}

// 历史记录下拉列表组件
function HistoryDropdown({ isVisible, historyList, onSelect, searchTerm, selectedIndex, onSelectedIndexChange }: HistoryDropdownProps) {
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
    .slice(0, 8); // 最多显示8条

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

export default PreLoadComponent;
