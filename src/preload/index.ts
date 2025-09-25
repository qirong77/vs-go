import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

// 定义 Web Component - VsGo 导航栏
class VsGoNavigationBar extends HTMLElement {
  declare shadowRoot: ShadowRoot;
  private backBtn!: HTMLButtonElement;
  private forwardBtn!: HTMLButtonElement;
  private refreshBtn!: HTMLButtonElement;
  private urlInput!: HTMLInputElement;
  private goBtn!: HTMLButtonElement;
  private closeBtn!: HTMLButtonElement;
  private updateInterval: number | null = null;

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
        <input class="url-input" type="text" placeholder="输入网址或使用google搜索..." />
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

    // 回车键导航
    this.urlInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.navigateToUrl();
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
      if (!document.querySelector("vsgo-navigation-bar") && !document.getElementById('vsgo-navigation-bar-fallback')) return;

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
      const fallbackNavBar = document.getElementById('vsgo-navigation-bar-fallback');
      
      if (webComponentNavBar || fallbackNavBar) {
        // 隐藏导航栏
        if (webComponentNavBar) {
          webComponentNavBar.remove();
        }
        if (fallbackNavBar) {
          fallbackNavBar.remove();
          document.body.style.removeProperty('margin-top');
          document.body.style.removeProperty('transition');
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
  if (typeof window.customElements === 'undefined' || window.customElements === null) {
    console.warn('此环境不支持 Web Components，将使用传统方式创建导航栏');
    return false;
  }
  
  // 检查是否已经注册过
  if (!window.customElements.get('vsgo-navigation-bar')) {
    try {
      window.customElements.define('vsgo-navigation-bar', VsGoNavigationBar);
      return true;
    } catch (error) {
      console.error('注册 Web Component 失败:', error);
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
  console.log('使用传统方式创建导航栏');
  
  // 检查是否已存在导航栏
  if (document.getElementById('vsgo-navigation-bar-fallback')) {
    return;
  }

  // 创建导航栏容器
  const navBar = document.createElement('div');
  navBar.id = 'vsgo-navigation-bar-fallback';
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
      <input id="fallback-url-input" type="text" placeholder="输入网址或使用google搜索..." style="
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
      " />
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
  document.body.style.setProperty('margin-top', '48px', 'important');
  document.body.style.setProperty('transition', 'margin-top 0.3s ease', 'important');
  
  // 绑定事件
  setupFallbackEvents(navBar);
}

// 为降级方案绑定事件
function setupFallbackEvents(navBar: HTMLElement) {
  const backBtn = navBar.querySelector('#fallback-back-btn') as HTMLButtonElement;
  const forwardBtn = navBar.querySelector('#fallback-forward-btn') as HTMLButtonElement;
  const refreshBtn = navBar.querySelector('#fallback-refresh-btn') as HTMLButtonElement;
  const urlInput = navBar.querySelector('#fallback-url-input') as HTMLInputElement;
  const goBtn = navBar.querySelector('#fallback-go-btn') as HTMLButtonElement;
  const closeBtn = navBar.querySelector('#fallback-close-btn') as HTMLButtonElement;
  
  // 更新导航状态
  function updateNavigationState() {
    backBtn.disabled = window.history.length <= 1;
    forwardBtn.disabled = false;
    urlInput.value = window.location.href;
    
    const title = document.title;
    if (title) {
      urlInput.placeholder = title.length > 50 ? title.substring(0, 50) + '...' : title;
    }
  }
  
  // 导航到URL
  function navigateToUrl() {
    let url = urlInput.value.trim();
    if (!url) return;
    
    const originalUrl = url;
    
    if (url.startsWith('/') || url.startsWith('file://')) {
      // 保持本地文件路径不变
    } else if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('ftp://')) {
      const isSearch = url.includes(' ') || (!url.includes('.') && !url.includes(':')) || (url.includes('.') && url.split('.').length < 2);
      
      if (isSearch) {
        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
      } else {
        url = `https://${url}`;
      }
    }
    
    const originalText = goBtn.textContent;
    goBtn.textContent = '...';
    goBtn.disabled = true;
    urlInput.disabled = true;
    
    try {
      window.location.href = url;
    } catch (e) {
      console.error('导航失败:', e);
      alert(`无法导航到: ${originalUrl}\n请检查网址是否正确。`);
      
      goBtn.textContent = originalText;
      goBtn.disabled = false;
      urlInput.disabled = false;
      urlInput.value = window.location.href;
    }
  }
  
  // 绑定事件
  backBtn.addEventListener('click', () => {
    try {
      window.history.back();
      setTimeout(updateNavigationState, 100);
    } catch (e) {
      console.warn('无法后退:', e);
    }
  });
  
  forwardBtn.addEventListener('click', () => {
    try {
      window.history.forward();
      setTimeout(updateNavigationState, 100);
    } catch (e) {
      console.warn('无法前进:', e);
    }
  });
  
  refreshBtn.addEventListener('click', () => {
    window.location.reload();
  });
  
  goBtn.addEventListener('click', navigateToUrl);
  
  urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      navigateToUrl();
    }
  });
  
  closeBtn.addEventListener('click', () => {
    navBar.remove();
    document.body.style.removeProperty('margin-top');
    document.body.style.removeProperty('transition');
  });
  
  // 监听页面变化
  window.addEventListener('popstate', updateNavigationState);
  window.addEventListener('load', updateNavigationState);
  
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
  if (!document.querySelector("vsgo-navigation-bar") && !document.getElementById('vsgo-navigation-bar-fallback')) {
    createNavigationBar();
  }
});
