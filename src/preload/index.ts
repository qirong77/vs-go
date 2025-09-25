import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import { VS_GO_EVENT } from "../common/EVENT";
import { debounce } from "../common/debounce";
import { BrowserItem } from "../main/electron/store";

// 定义 Web Component - VsGo 导航栏
class VsGoNavigationBar extends HTMLElement {
  declare shadowRoot: ShadowRoot;
  private backBtn!: HTMLButtonElement;
  private forwardBtn!: HTMLButtonElement;
  private refreshBtn!: HTMLButtonElement;
  private urlInput!: HTMLInputElement;
  private goBtn!: HTMLButtonElement;
  private closeBtn!: HTMLButtonElement;
  private historyContainer!: HTMLDivElement;
  private updateInterval: number | null = null;
  private isHistoryVisible = false;
  private currentHistoryData: any[] = [];

  constructor() {
    super();
    this.shadowRoot = this.attachShadow({ mode: "closed" });
    this.render();
    this.setupEventListeners();
    this.adjustBodyMargin(true);
  }

  private render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 999999;
          background: linear-gradient(to bottom, #f8f9fa 0%, #e9ecef 100%);
          border-bottom: 1px solid #dee2e6;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        
        .nav-container {
          display: flex;
          align-items: center;
          padding: 8px 16px;
          gap: 10px;
          height: 48px;
          box-sizing: border-box;
          max-width: 1200px;
          margin: 0 auto;
        }
        
        button {
          background: linear-gradient(to bottom, #ffffff 0%, #f1f3f4 100%);
          border: 1px solid #dadce0;
          border-radius: 6px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 14px;
          height: 32px;
          min-width: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          font-weight: 500;
          box-shadow: 0 1px 2px rgba(0,0,0,0.1);
          font-family: inherit;
        }
        
        button:hover {
          background: linear-gradient(to bottom, #f8f9fa 0%, #e9ecef 100%);
          border-color: #1a73e8;
          box-shadow: 0 2px 4px rgba(0,0,0,0.15);
          transform: translateY(-1px);
        }
        
        button:active {
          transform: translateY(0);
          box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }
        
        button:disabled {
          background: #f8f9fa;
          color: #9aa0a6;
          cursor: not-allowed;
          border-color: #e8eaed;
          box-shadow: none;
          transform: none;
        }
        
        button:disabled:hover {
          transform: none;
          box-shadow: none;
        }
        
        .refresh-btn {
          font-size: 22px !important;
          padding-bottom: 10px !important;
        }
        
        .url-input {
          flex: 1;
          padding: 8px 16px;
          border: 1px solid #dadce0;
          border-radius: 24px;
          font-size: 14px;
          height: 32px;
          box-sizing: border-box;
          background: #fff;
          transition: all 0.2s ease;
          box-shadow: 0 1px 2px rgba(0,0,0,0.1);
          font-family: inherit;
        }
        
        .url-input:focus {
          outline: none;
          border-color: #1a73e8;
          box-shadow: 0 2px 8px rgba(26, 115, 232, 0.2);
          background: #fff;
        }
        
        .go-btn {
          background: linear-gradient(to bottom, #1a73e8 0%, #1557b0 100%) !important;
          color: white !important;
          border: 1px solid #1557b0 !important;
          font-weight: 600 !important;
          min-width: 48px !important;
        }
        
        .go-btn:hover {
          background: linear-gradient(to bottom, #1557b0 0%, #1a73e8 100%) !important;
          box-shadow: 0 2px 8px rgba(26, 115, 232, 0.3) !important;
        }
        
        .close-btn {
          background: linear-gradient(to bottom, #ea4335 0%, #d93025 100%) !important;
          color: white !important;
          border: 1px solid #d93025 !important;
          font-weight: 600 !important;
          font-size: 16px !important;
        }
        
        .close-btn:hover {
          background: linear-gradient(to bottom, #d93025 0%, #ea4335 100%) !important;
          box-shadow: 0 2px 8px rgba(234, 67, 53, 0.3) !important;
        }
        
        /* 历史记录容器样式 */
        .history-container {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #dadce0;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          max-height: 240px;
          overflow-y: auto;
          z-index: 1000;
          display: none;
          margin-top: 2px;
        }
        
        .history-container.visible {
          display: block;
        }
        
        .history-item {
          padding: 12px 16px;
          border-bottom: 1px solid #f1f3f4;
          cursor: pointer;
          transition: background-color 0.2s ease;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .history-item:last-child {
          border-bottom: none;
        }
        
        .history-item:hover {
          background: #f8f9fa;
        }
        
        .history-item:active {
          background: #e8f0fe;
        }
        
        .history-item.selected {
          background: #e8f0fe;
        }
        
        .history-item-url {
          color: #1a73e8;
          font-weight: 500;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        .history-item-title {
          color: #5f6368;
          font-size: 13px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        .url-input-container {
          position: relative;
          flex: 1;
        }
        
        /* 响应式设计 */
        @media (max-width: 768px) {
          .nav-container {
            padding: 6px 12px;
            height: 44px;
            gap: 8px;
          }
          
          button {
            height: 28px;
            min-width: 28px;
            padding: 6px 10px;
            font-size: 13px;
          }
          
          .url-input {
            height: 28px;
            padding: 6px 12px;
            font-size: 13px;
          }
        }
      </style>
      
      <div class="nav-container">
        <button class="back-btn" title="后退">←</button>
        <button class="forward-btn" title="前进">→</button>
        <button class="refresh-btn" title="刷新">⟳</button>
        <div class="url-input-container">
          <input class="url-input" type="text" placeholder="输入网址或使用google搜索..." />
          <div class="history-container">
            <!-- 历史记录项将动态添加到这里 -->
          </div>
        </div>
        <button class="go-btn" title="转到">Go</button>
        <button class="close-btn" title="关闭导航栏">×</button>
      </div>
    `;

    // 获取元素引用
    this.backBtn = this.shadowRoot.querySelector(".back-btn") as HTMLButtonElement;
    this.forwardBtn = this.shadowRoot.querySelector(".forward-btn") as HTMLButtonElement;
    this.refreshBtn = this.shadowRoot.querySelector(".refresh-btn") as HTMLButtonElement;
    this.urlInput = this.shadowRoot.querySelector(".url-input") as HTMLInputElement;
    this.goBtn = this.shadowRoot.querySelector(".go-btn") as HTMLButtonElement;
    this.closeBtn = this.shadowRoot.querySelector(".close-btn") as HTMLButtonElement;
    this.historyContainer = this.shadowRoot.querySelector(".history-container") as HTMLDivElement;
  }

  private setupEventListeners() {
    // 后退功能
    this.backBtn.addEventListener("click", () => {
      try {
        window.history.back();
        setTimeout(() => this.updateNavigationState(), 100);
      } catch (e) {
        console.warn("无法后退:", e);
      }
    });

    // 前进功能
    this.forwardBtn.addEventListener("click", () => {
      try {
        window.history.forward();
        setTimeout(() => this.updateNavigationState(), 100);
      } catch (e) {
        console.warn("无法前进:", e);
      }
    });

    // 刷新功能
    this.refreshBtn.addEventListener("click", () => {
      window.location.reload();
    });

    // Go按钮点击
    this.goBtn.addEventListener("click", () => this.navigateToUrl());

    // 回车键导航和键盘导航
    this.urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if (this.isHistoryVisible && this.selectCurrentHistoryItem()) {
          // 选择了历史记录项，不做其他操作
          return;
        }
        this.hideHistory();
        this.navigateToUrl();
      } else if (e.key === "Escape") {
        this.hideHistory();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        this.navigateHistoryItems(e.key === "ArrowDown" ? 1 : -1);
      }
    });

    // 关闭导航栏
    this.closeBtn.addEventListener("click", () => {
      this.remove();
    });

    // 监听页面导航事件
    window.addEventListener("popstate", () => this.updateNavigationState());
    window.addEventListener("load", () => this.updateNavigationState());

    // 定期更新URL
    let lastUrl = window.location.href;
    this.updateInterval = window.setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        this.updateNavigationState();
      }
    }, 500);

    // 键盘快捷键支持
    this.setupKeyboardShortcuts();

    // 初始化状态
    this.updateNavigationState();

    // 添加历史记录相关事件
    this.setupHistoryEventListeners();
  }

  private setupHistoryEventListeners() {
    // 输入框输入事件
    this.urlInput.addEventListener("input", () => {
      const query = this.urlInput.value.trim();
      debounceUpdateHistory((response) => {
        this.showHistory(response, query);
      });
    });

    // 输入框聚焦事件
    this.urlInput.addEventListener("focus", () => {
      const query = this.urlInput.value.trim();
      debounceUpdateHistory((response) => {
        this.showHistory(response, query);
      });
    });

    // 输入框失焦事件
    this.urlInput.addEventListener("blur", () => {
      // 延迟隐藏，以便点击历史记录项
      setTimeout(() => {
        this.hideHistory();
      }, 150);
    });

    // 点击其他地方隐藏历史记录
    document.addEventListener("click", (e) => {
      const target = e.target as Element;
      if (!target.closest(".url-input-container")) {
        this.hideHistory();
      }
    });
  }

  private showHistory(historyData: any[], query: string = "") {
    this.currentHistoryData = historyData || [];
    
    // 过滤历史记录
    const filteredHistory = query 
      ? this.currentHistoryData.filter(item => 
          (item.url && item.url.toLowerCase().includes(query.toLowerCase())) ||
          (item.title && item.title.toLowerCase().includes(query.toLowerCase()))
        )
      : this.currentHistoryData;

    // 限制显示数量
    const displayHistory = filteredHistory.slice(0, 10);

    // 清空现有内容
    this.historyContainer.innerHTML = "";

    if (displayHistory.length === 0) {
      this.hideHistory();
      return;
    }

    // 添加历史记录项
    displayHistory.forEach(item => {
      const historyItem = document.createElement("div");
      historyItem.className = "history-item";
      
      historyItem.innerHTML = `
        <div style="flex: 1; min-width: 0;">
          <div class="history-item-url">${this.escapeHtml(item.url || "")}</div>
          ${item.title ? `<div class="history-item-title">${this.escapeHtml(item.title)}</div>` : ""}
        </div>
      `;

      // 点击事件
      historyItem.addEventListener("click", () => {
        this.urlInput.value = item.url || "";
        this.hideHistory();
        this.navigateToUrl();
      });

      this.historyContainer.appendChild(historyItem);
    });

    // 显示历史记录容器
    this.historyContainer.classList.add("visible");
    this.isHistoryVisible = true;
  }

  private hideHistory() {
    this.historyContainer.classList.remove("visible");
    this.isHistoryVisible = false;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  private navigateHistoryItems(direction: number) {
    if (!this.isHistoryVisible) return;

    const items = this.historyContainer.querySelectorAll(".history-item");
    if (items.length === 0) return;

    let currentIndex = -1;
    items.forEach((item, index) => {
      if (item.classList.contains("selected")) {
        currentIndex = index;
        item.classList.remove("selected");
      }
    });

    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = items.length - 1;
    if (newIndex >= items.length) newIndex = 0;

    const selectedItem = items[newIndex] as HTMLElement;
    selectedItem.classList.add("selected");
    
    // 滚动到可见位置
    selectedItem.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  }

  private selectCurrentHistoryItem(): boolean {
    if (!this.isHistoryVisible) return false;

    const selectedItem = this.historyContainer.querySelector(".history-item.selected");
    if (selectedItem) {
      const urlElement = selectedItem.querySelector(".history-item-url");
      if (urlElement) {
        this.urlInput.value = urlElement.textContent || "";
        this.hideHistory();
        this.navigateToUrl();
        return true;
      }
    }
    return false;
  }

  private updateNavigationState() {
    this.backBtn.disabled = window.history.length <= 1;
    this.forwardBtn.disabled = false;
    this.urlInput.value = window.location.href;

    // 更新页面标题到导航栏
    const title = document.title;
    if (title && this.urlInput.placeholder !== title) {
      this.urlInput.placeholder = title.length > 50 ? title.substring(0, 50) + "..." : title;
    }
  }

  private navigateToUrl() {
    let url = this.urlInput.value.trim();
    if (!url) return;

    const originalUrl = url;

    // URL格式化和验证
    if (url.startsWith("/") || url.startsWith("file://")) {
      // 保持本地文件路径不变
    } else if (
      !url.startsWith("http://") &&
      !url.startsWith("https://") &&
      !url.startsWith("ftp://")
    ) {
      // 检查是否像是搜索查询
      const isSearch =
        url.includes(" ") ||
        (!url.includes(".") && !url.includes(":")) ||
        (url.includes(".") && url.split(".").length < 2);

      if (isSearch) {
        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
      } else {
        url = `https://${url}`;
      }
    }

    // 显示加载状态
    const originalText = this.goBtn.textContent;
    this.goBtn.textContent = "...";
    this.goBtn.disabled = true;
    this.urlInput.disabled = true;

    try {
      window.location.href = url;
    } catch (e) {
      console.error("导航失败:", e);
      alert(`无法导航到: ${originalUrl}\n请检查网址是否正确。`);

      // 恢复原始状态
      this.goBtn.textContent = originalText;
      this.goBtn.disabled = false;
      this.urlInput.disabled = false;
      this.urlInput.value = window.location.href;
    }
  }

  private setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      // 检查是否存在导航栏（Web Component 或降级版本）
      if (
        !document.querySelector("vsgo-navigation-bar") &&
        !document.getElementById("vsgo-navigation-bar-fallback")
      )
        return;

      // Cmd/Ctrl + 左箭头 = 后退
      if ((e.metaKey || e.ctrlKey) && e.key === "ArrowLeft") {
        e.preventDefault();
        if (!this.backBtn.disabled) {
          this.backBtn.click();
        }
      }

      // Cmd/Ctrl + 右箭头 = 前进
      if ((e.metaKey || e.ctrlKey) && e.key === "ArrowRight") {
        e.preventDefault();
        if (!this.forwardBtn.disabled) {
          this.forwardBtn.click();
        }
      }

      // Cmd/Ctrl + R = 刷新
      if ((e.metaKey || e.ctrlKey) && e.key === "r") {
        e.preventDefault();
        this.refreshBtn.click();
      }

      // Cmd/Ctrl + L = 聚焦地址栏
      if ((e.metaKey || e.ctrlKey) && e.key === "l") {
        e.preventDefault();
        this.urlInput.focus();
        this.urlInput.select();
      }
    });
  }

  private adjustBodyMargin(add: boolean) {
    if (add) {
      // 添加顶部边距
      document.body.style.setProperty("margin-top", "48px", "important");
      document.body.style.setProperty("transition", "margin-top 0.3s ease", "important");
    } else {
      // 移除顶部边距
      document.body.style.removeProperty("margin-top");
      document.body.style.removeProperty("transition");
    }

    // 响应式处理
    if (window.innerWidth <= 768) {
      document.body.style.setProperty("margin-top", add ? "44px" : "0", "important");
    }
  }

  // Web Component 生命周期
  connectedCallback() {
    this.adjustBodyMargin(true);
  }

  disconnectedCallback() {
    this.adjustBodyMargin(false);
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }
}

// Custom APIs for renderer
const api = {
  // 导航栏控制 API
  navigation: {
    toggleNavigationBar: () => {
      const webComponentNavBar = document.querySelector("vsgo-navigation-bar");
      const fallbackNavBar = document.getElementById("vsgo-navigation-bar-fallback");

      if (webComponentNavBar || fallbackNavBar) {
        // 隐藏导航栏
        if (webComponentNavBar) {
          webComponentNavBar.remove();
        }
        if (fallbackNavBar) {
          fallbackNavBar.remove();
          document.body.style.removeProperty("margin-top");
          document.body.style.removeProperty("transition");
        }
      } else {
        // 显示导航栏
        createNavigationBar();
      }
    },
    goBack: () => {
      try {
        window.history.back();
      } catch (e) {
        console.warn("无法后退:", e);
      }
    },
    goForward: () => {
      try {
        window.history.forward();
      } catch (e) {
        console.warn("无法前进:", e);
      }
    },
    refresh: () => {
      window.location.reload();
    },
    navigateTo: (url: string) => {
      try {
        window.location.href = url;
      } catch (e) {
        console.error("导航失败:", e);
      }
    },
    getCurrentUrl: () => {
      return window.location.href;
    },
  },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}

// 注册 Web Component - 确保在全局作用域中注册
function registerWebComponent() {
  // 检查浏览器是否支持 Web Components
  if (typeof window.customElements === "undefined" || window.customElements === null) {
    console.warn("此环境不支持 Web Components，将使用传统方式创建导航栏");
    return false;
  }

  // 检查是否已经注册过
  if (!window.customElements.get("vsgo-navigation-bar")) {
    try {
      window.customElements.define("vsgo-navigation-bar", VsGoNavigationBar);
      return true;
    } catch (error) {
      console.error("注册 Web Component 失败:", error);
      return false;
    }
  }
  return true;
}

// 创建并注入导航栏 Web Component
function createNavigationBar() {
  // 检查是否已存在导航栏，避免重复创建
  if (document.querySelector("vsgo-navigation-bar")) {
    return;
  }

  // 尝试使用 Web Component
  if (registerWebComponent()) {
    // 创建 Web Component 实例
    const navBar = document.createElement("vsgo-navigation-bar") as VsGoNavigationBar;
    document.body.insertBefore(navBar, document.body.firstChild);
  } else {
    // 降级到传统方式创建导航栏
    createFallbackNavigationBar();
  }
}

// 传统方式创建导航栏（降级方案）
function createFallbackNavigationBar() {
  console.log("使用传统方式创建导航栏");

  // 检查是否已存在导航栏
  if (document.getElementById("vsgo-navigation-bar-fallback")) {
    return;
  }

  // 创建导航栏容器
  const navBar = document.createElement("div");
  navBar.id = "vsgo-navigation-bar-fallback";
  navBar.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 999999;
    background: linear-gradient(to bottom, #f8f9fa 0%, #e9ecef 100%);
    border-bottom: 1px solid #dee2e6;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  `;

  navBar.innerHTML = `
    <div style="
      display: flex;
      align-items: center;
      padding: 8px 16px;
      gap: 10px;
      height: 48px;
      box-sizing: border-box;
      max-width: 1200px;
      margin: 0 auto;
    ">
      <button id="fallback-back-btn" title="后退" style="
        background: linear-gradient(to bottom, #ffffff 0%, #f1f3f4 100%);
        border: 1px solid #dadce0;
        border-radius: 6px;
        padding: 8px 12px;
        cursor: pointer;
        font-size: 14px;
        height: 32px;
        min-width: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        font-weight: 500;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        font-family: inherit;
      ">←</button>
      <button id="fallback-forward-btn" title="前进" style="
        background: linear-gradient(to bottom, #ffffff 0%, #f1f3f4 100%);
        border: 1px solid #dadce0;
        border-radius: 6px;
        padding: 8px 12px;
        cursor: pointer;
        font-size: 14px;
        height: 32px;
        min-width: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        font-weight: 500;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        font-family: inherit;
      ">→</button>
      <button id="fallback-refresh-btn" title="刷新" style="
        background: linear-gradient(to bottom, #ffffff 0%, #f1f3f4 100%);
        border: 1px solid #dadce0;
        border-radius: 6px;
        padding: 8px 12px;
        cursor: pointer;
        font-size: 22px;
        height: 32px;
        min-width: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        font-weight: 500;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        font-family: inherit;
        padding-bottom: 10px;
      ">⟳</button>
      <div style="
        flex: 1;
        position: relative;
      ">
        <input id="fallback-url-input" type="text" placeholder="输入网址或使用google搜索..." style="
          width: 100%;
          padding: 8px 16px;
          border: 1px solid #dadce0;
          border-radius: 24px;
          font-size: 14px;
          height: 32px;
          box-sizing: border-box;
          background: #fff;
          transition: all 0.2s ease;
          box-shadow: 0 1px 2px rgba(0,0,0,0.1);
          font-family: inherit;
        " />
        <div id="fallback-history-container" style="
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #dadce0;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          max-height: 240px;
          overflow-y: auto;
          z-index: 1000;
          display: none;
          margin-top: 2px;
        ">
          <!-- 历史记录项将动态添加到这里 -->
        </div>
      </div>
      <button id="fallback-go-btn" title="转到" style="
        background: linear-gradient(to bottom, #1a73e8 0%, #1557b0 100%);
        color: white;
        border: 1px solid #1557b0;
        border-radius: 6px;
        padding: 8px 12px;
        cursor: pointer;
        font-size: 14px;
        height: 32px;
        min-width: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        font-weight: 600;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        font-family: inherit;
      ">Go</button>
      <button id="fallback-close-btn" title="关闭导航栏" style="
        background: linear-gradient(to bottom, #ea4335 0%, #d93025 100%);
        color: white;
        border: 1px solid #d93025;
        border-radius: 6px;
        padding: 8px 12px;
        cursor: pointer;
        font-size: 16px;
        height: 32px;
        min-width: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        font-weight: 600;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        font-family: inherit;
      ">×</button>
    </div>
  `;

  // 添加到页面
  document.body.insertBefore(navBar, document.body.firstChild);

  // 调整页面边距
  document.body.style.setProperty("margin-top", "48px", "important");
  document.body.style.setProperty("transition", "margin-top 0.3s ease", "important");

  // 绑定事件
  setupFallbackEvents(navBar);
}
const debounceUpdateHistory = debounce((callback?: (response: any) => void) => {
  ipcRenderer.invoke(VS_GO_EVENT.FLOATING_WINDOW_SEARCH_URL, "").then((response) => {
    if (callback) {
      callback(response);
    }
  });
}, 200);
// 为降级方案绑定事件
function setupFallbackEvents(navBar: HTMLElement) {
  const backBtn = navBar.querySelector("#fallback-back-btn") as HTMLButtonElement;
  const forwardBtn = navBar.querySelector("#fallback-forward-btn") as HTMLButtonElement;
  const refreshBtn = navBar.querySelector("#fallback-refresh-btn") as HTMLButtonElement;
  const urlInput = navBar.querySelector("#fallback-url-input") as HTMLInputElement;
  const goBtn = navBar.querySelector("#fallback-go-btn") as HTMLButtonElement;
  const closeBtn = navBar.querySelector("#fallback-close-btn") as HTMLButtonElement;
  const historyContainer = navBar.querySelector("#fallback-history-container") as HTMLDivElement;

  // 历史记录状态
  let isHistoryVisible = false;
  let currentHistoryData: BrowserItem[] = [];

  // 历史记录相关函数
  function showHistory(historyData: BrowserItem[], query: string = "") {
    currentHistoryData = historyData || [];
    
    // 过滤历史记录
    const filteredHistory = query 
      ? currentHistoryData.filter(item => 
          (item.url && item.url.toLowerCase().includes(query.toLowerCase())) ||
          (item.name && item.name.toLowerCase().includes(query.toLowerCase()))
        )
      : currentHistoryData;

    // 限制显示数量
    const displayHistory = filteredHistory.slice(0, 10);

    // 清空现有内容
    historyContainer.innerHTML = "";

    if (displayHistory.length === 0) {
      hideHistory();
      return;
    }

    // 添加历史记录项
    displayHistory.forEach(item => {
      const historyItem = document.createElement("div");
      historyItem.className = "fallback-history-item";
      historyItem.style.cssText = `
        padding: 12px 16px;
        border-bottom: 1px solid #f1f3f4;
        cursor: pointer;
        transition: background-color 0.2s ease;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 8px;
      `;
      
      historyItem.innerHTML = `
        <div style="flex: 1; min-width: 0;">
          <div style="color: #1a73e8; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(item.url || "")}</div>
          ${item.name ? `<div style="color: #5f6368; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(item.name)}</div>` : ""}
        </div>
      `;

      // 悬停效果
      historyItem.addEventListener("mouseenter", () => {
        historyItem.style.background = "#f8f9fa";
      });
      
      historyItem.addEventListener("mouseleave", () => {
        if (!historyItem.classList.contains("selected")) {
          historyItem.style.background = "";
        }
      });

      // 点击事件
      historyItem.addEventListener("click", () => {
        urlInput.value = item.url || "";
        hideHistory();
        navigateToUrl();
      });

      historyContainer.appendChild(historyItem);
    });

    // 显示历史记录容器
    historyContainer.style.display = "block";
    isHistoryVisible = true;
  }

  function hideHistory() {
    historyContainer.style.display = "none";
    isHistoryVisible = false;
  }

  function escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function navigateHistoryItems(direction: number) {
    if (!isHistoryVisible) return;

    const items = historyContainer.querySelectorAll(".fallback-history-item");
    if (items.length === 0) return;

    let currentIndex = -1;
    items.forEach((item, index) => {
      if (item.classList.contains("selected")) {
        currentIndex = index;
        item.classList.remove("selected");
        (item as HTMLElement).style.background = "";
      }
    });

    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = items.length - 1;
    if (newIndex >= items.length) newIndex = 0;

    const selectedItem = items[newIndex] as HTMLElement;
    selectedItem.classList.add("selected");
    selectedItem.style.background = "#e8f0fe";
    
    // 滚动到可见位置
    selectedItem.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  }

  function selectCurrentHistoryItem(): boolean {
    if (!isHistoryVisible) return false;

    const selectedItem = historyContainer.querySelector(".fallback-history-item.selected");
    if (selectedItem) {
      const urlElement = selectedItem.querySelector("div > div");
      if (urlElement) {
        urlInput.value = urlElement.textContent || "";
        hideHistory();
        navigateToUrl();
        return true;
      }
    }
    return false;
  }

  // 更新导航状态
  function updateNavigationState() {
    backBtn.disabled = window.history.length <= 1;
    forwardBtn.disabled = false;
    urlInput.value = window.location.href;

    const title = document.title;
    if (title) {
      urlInput.placeholder = title.length > 50 ? title.substring(0, 50) + "..." : title;
    }
  }

  // 导航到URL
  function navigateToUrl() {
    let url = urlInput.value.trim();
    if (!url) return;

    const originalUrl = url;

    if (url.startsWith("/") || url.startsWith("file://")) {
      // 保持本地文件路径不变
    } else if (
      !url.startsWith("http://") &&
      !url.startsWith("https://") &&
      !url.startsWith("ftp://")
    ) {
      const isSearch =
        url.includes(" ") ||
        (!url.includes(".") && !url.includes(":")) ||
        (url.includes(".") && url.split(".").length < 2);

      if (isSearch) {
        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
      } else {
        url = `https://${url}`;
      }
    }

    const originalText = goBtn.textContent;
    goBtn.textContent = "...";
    goBtn.disabled = true;
    urlInput.disabled = true;

    try {
      window.location.href = url;
    } catch (e) {
      console.error("导航失败:", e);
      alert(`无法导航到: ${originalUrl}\n请检查网址是否正确。`);

      goBtn.textContent = originalText;
      goBtn.disabled = false;
      urlInput.disabled = false;
      urlInput.value = window.location.href;
    }
  }

  // 绑定事件
  backBtn.addEventListener("click", () => {
    try {
      window.history.back();
      setTimeout(updateNavigationState, 100);
    } catch (e) {
      console.warn("无法后退:", e);
    }
  });

  forwardBtn.addEventListener("click", () => {
    try {
      window.history.forward();
      setTimeout(updateNavigationState, 100);
    } catch (e) {
      console.warn("无法前进:", e);
    }
  });

  refreshBtn.addEventListener("click", () => {
    window.location.reload();
  });

  goBtn.addEventListener("click", navigateToUrl);

  // 键盘事件处理
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (isHistoryVisible && selectCurrentHistoryItem()) {
        // 选择了历史记录项，不做其他操作
        return;
      }
      hideHistory();
      navigateToUrl();
    } else if (e.key === "Escape") {
      hideHistory();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      navigateHistoryItems(e.key === "ArrowDown" ? 1 : -1);
    }
  });

  // 输入事件
  urlInput.addEventListener("input", () => {
    const query = urlInput.value.trim();
    debounceUpdateHistory((response) => {
      showHistory(response, query);
    });
  });

  // 聚焦事件
  urlInput.addEventListener("focus", () => {
    const query = urlInput.value.trim();
    debounceUpdateHistory((response) => {
      showHistory(response, query);
    });
  });

  // 失焦事件
  urlInput.addEventListener("blur", () => {
    // 延迟隐藏，以便点击历史记录项
    setTimeout(() => {
      hideHistory();
    }, 150);
  });

  // 点击其他地方隐藏历史记录
  document.addEventListener("click", (e) => {
    const target = e.target as Element;
    if (!target.closest("#vsgo-navigation-bar-fallback")) {
      hideHistory();
    }
  });

  closeBtn.addEventListener("click", () => {
    navBar.remove();
    document.body.style.removeProperty("margin-top");
    document.body.style.removeProperty("transition");
  });

  // 监听页面变化
  window.addEventListener("popstate", updateNavigationState);
  window.addEventListener("load", updateNavigationState);

  // 定期更新URL
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      updateNavigationState();
    }
  }, 500);

  // 初始化状态
  updateNavigationState();
}

// 监听页面完全加载
window.addEventListener("DOMContentLoaded", () => {
  if (window.location.href.startsWith("file://")) {
    return;
  }
  if (
    window.location.href.includes("browser-setting") ||
    window.location.href.includes("main-window")
  ) {
    return;
  }
  // 确保导航栏存在
  if (
    !document.querySelector("vsgo-navigation-bar") &&
    !document.getElementById("vsgo-navigation-bar-fallback")
  ) {
    createNavigationBar();
  }
  ipcRenderer.invoke(VS_GO_EVENT.FLOATING_WINDOW_SEARCH_URL, "").then((response) => {
    console.log(response);
  });
});
