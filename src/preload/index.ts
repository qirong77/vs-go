import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

// Custom APIs for renderer
const api = {
  // 导航栏控制 API
  navigation: {
    toggleNavigationBar: () => {
      const navBar = document.getElementById("vs-go-navigation-bar");
      if (navBar) {
        // 隐藏导航栏
        navBar.remove();
        document.body.style.marginTop = "";
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

// 创建并注入导航栏
function createNavigationBar() {
  // 检查是否已存在导航栏，避免重复创建
  if (document.getElementById("vs-go-navigation-bar")) {
    return;
  }

  // 创建导航栏容器
  const navBar = document.createElement("div");
  navBar.id = "vs-go-navigation-bar";
  navBar.innerHTML = `
    <div id="vs-go-nav-container">
      <button id="vs-go-back-btn" title="后退">←</button>
      <button id="vs-go-forward-btn" title="前进">→</button>
      <button id="vs-go-refresh-btn" title="刷新">⟳</button>
      <input id="vs-go-url-input" type="text" placeholder="输入网址或使用google搜索..." />
      <button id="vs-go-go-btn" title="转到">Go</button>
    </div>
  `;

  // 添加样式
  const style = document.createElement("style");
  style.textContent = `
    #vs-go-refresh-btn {
        font-size: 22px !important;
        padding-bottom: 10px !important;
    }
    #vs-go-navigation-bar {
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
    
    #vs-go-nav-container {
      display: flex;
      align-items: center;
      padding: 8px 16px;
      gap: 10px;
      height: 48px;
      box-sizing: border-box;
      max-width: 1200px;
      margin: 0 auto;
    }
    
    #vs-go-navigation-bar button {
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
    }
    
    #vs-go-navigation-bar button:hover {
      background: linear-gradient(to bottom, #f8f9fa 0%, #e9ecef 100%);
      border-color: #1a73e8;
      box-shadow: 0 2px 4px rgba(0,0,0,0.15);
      transform: translateY(-1px);
    }
    
    #vs-go-navigation-bar button:active {
      transform: translateY(0);
      box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    }
    
    #vs-go-navigation-bar button:disabled {
      background: #f8f9fa;
      color: #9aa0a6;
      cursor: not-allowed;
      border-color: #e8eaed;
      box-shadow: none;
      transform: none;
    }
    
    #vs-go-navigation-bar button:disabled:hover {
      transform: none;
      box-shadow: none;
    }
    
    #vs-go-url-input {
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
    }
    
    #vs-go-url-input:focus {
      outline: none;
      border-color: #1a73e8;
      box-shadow: 0 2px 8px rgba(26, 115, 232, 0.2);
      background: #fff;
    }
    
    #vs-go-go-btn {
      background: linear-gradient(to bottom, #1a73e8 0%, #1557b0 100%) !important;
      color: white !important;
      border: 1px solid #1557b0 !important;
      font-weight: 600 !important;
      min-width: 48px !important;
    }
    
    #vs-go-go-btn:hover {
      background: linear-gradient(to bottom, #1557b0 0%, #1a73e8 100%) !important;
      box-shadow: 0 2px 8px rgba(26, 115, 232, 0.3) !important;
    }
    
    #vs-go-close-btn {
      background: linear-gradient(to bottom, #ea4335 0%, #d93025 100%) !important;
      color: white !important;
      border: 1px solid #d93025 !important;
      font-weight: 600 !important;
      font-size: 16px !important;
    }
    
    #vs-go-close-btn:hover {
      background: linear-gradient(to bottom, #d93025 0%, #ea4335 100%) !important;
      box-shadow: 0 2px 8px rgba(234, 67, 53, 0.3) !important;
    }
    
    /* 为页面内容添加顶部边距，避免被导航栏遮挡 */
    body {
      margin-top: 48px !important;
      transition: margin-top 0.3s ease;
    }
    
    /* 处理一些特殊情况 */
    body > *:first-child:not(#vs-go-navigation-bar) {
      margin-top: 0 !important;
    }
    
    /* 响应式设计 */
    @media (max-width: 768px) {
      #vs-go-nav-container {
        padding: 6px 12px;
        height: 44px;
        gap: 8px;
      }
      
      #vs-go-navigation-bar button {
        height: 28px;
        min-width: 28px;
        padding: 6px 10px;
        font-size: 13px;
      }
      
      #vs-go-url-input {
        height: 28px;
        padding: 6px 12px;
        font-size: 13px;
      }
      
      body {
        margin-top: 44px !important;
      }
    }
  `;

  // 将导航栏和样式添加到页面
  document.head.appendChild(style);
  document.body.insertBefore(navBar, document.body.firstChild);

  // 绑定事件处理器
  setupNavigationEvents();
  function setupNavigationEvents() {
    const backBtn = document.getElementById("vs-go-back-btn") as HTMLButtonElement;
    const forwardBtn = document.getElementById("vs-go-forward-btn") as HTMLButtonElement;
    const refreshBtn = document.getElementById("vs-go-refresh-btn") as HTMLButtonElement;
    const urlInput = document.getElementById("vs-go-url-input") as HTMLInputElement;
    const goBtn = document.getElementById("vs-go-go-btn") as HTMLButtonElement;

    // 更新按钮状态
    function updateNavigationState() {
      // 检查是否可以后退（通过检查 history.length 和当前状态）
      backBtn.disabled = window.history.length <= 1;
      // 前进按钮状态较难检测，保持启用状态
      forwardBtn.disabled = false;
      urlInput.value = window.location.href;

      // 更新页面标题到导航栏（可选功能）
      const title = document.title;
      if (title && urlInput.placeholder !== title) {
        urlInput.placeholder = title.length > 50 ? title.substring(0, 50) + "..." : title;
      }
    }
    updateNavigationState()
    // 后退功能
    backBtn.addEventListener("click", () => {
      try {
        window.history.back();
        setTimeout(updateNavigationState, 100);
      } catch (e) {
        console.warn("无法后退:", e);
      }
    });

    // 前进功能
    forwardBtn.addEventListener("click", () => {
      try {
        window.history.forward();
        setTimeout(updateNavigationState, 100);
      } catch (e) {
        console.warn("无法前进:", e);
      }
    });

    // 刷新功能
    refreshBtn.addEventListener("click", () => {
      window.location.reload();
    });

    // URL导航功能
    function navigateToUrl() {
      let url = urlInput.value.trim();
      if (!url) return;

      // 更详细的URL格式化和验证
      const originalUrl = url;

      // 检查是否是本地文件路径
      if (url.startsWith("/") || url.startsWith("file://")) {
        // 保持本地文件路径不变
      } else if (
        !url.startsWith("http://") &&
        !url.startsWith("https://") &&
        !url.startsWith("ftp://")
      ) {
        // 检查是否像是搜索查询而不是URL
        const isSearch =
          url.includes(" ") ||
          (!url.includes(".") && !url.includes(":")) ||
          (url.includes(".") && url.split(".").length < 2);

        if (isSearch) {
          // 使用搜索引擎搜索
          url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
        } else {
          // 假设是网址，添加https://
          url = `https://${url}`;
        }
      }
      // 显示加载状态
      const originalText = goBtn.textContent;
      goBtn.textContent = "...";
      goBtn.disabled = true;
      urlInput.disabled = true;

      try {
        window.location.href = url;
      } catch (e) {
        console.error("导航失败:", e);
        alert(`无法导航到: ${originalUrl}\n请检查网址是否正确。`);

        // 恢复原始状态
        goBtn.textContent = originalText;
        goBtn.disabled = false;
        urlInput.disabled = false;
        urlInput.value = window.location.href; // 恢复当前URL
      }
    }

    // Go按钮点击
    goBtn.addEventListener("click", navigateToUrl);

    // 回车键导航
    urlInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        navigateToUrl();
      }
    });

    // 监听页面导航事件，更新地址栏
    window.addEventListener("popstate", updateNavigationState);
    window.addEventListener("load", updateNavigationState);

    // 初始化状态
    updateNavigationState();

    // 定期更新URL（处理单页面应用的路由变化）
    let lastUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        updateNavigationState();
      }
    }, 500);

    // 添加键盘快捷键支持
    document.addEventListener("keydown", (e) => {
      // 只有在导航栏存在时才处理快捷键
      if (!document.getElementById("vs-go-navigation-bar")) return;

      // Cmd/Ctrl + 左箭头 = 后退
      if ((e.metaKey || e.ctrlKey) && e.key === "ArrowLeft") {
        e.preventDefault();
        if (!backBtn.disabled) {
          backBtn.click();
        }
      }

      // Cmd/Ctrl + 右箭头 = 前进
      if ((e.metaKey || e.ctrlKey) && e.key === "ArrowRight") {
        e.preventDefault();
        if (!forwardBtn.disabled) {
          forwardBtn.click();
        }
      }

      // Cmd/Ctrl + R = 刷新
      if ((e.metaKey || e.ctrlKey) && e.key === "r") {
        e.preventDefault();
        refreshBtn.click();
      }

      // Cmd/Ctrl + L = 聚焦地址栏
      if ((e.metaKey || e.ctrlKey) && e.key === "l") {
        e.preventDefault();
        urlInput.focus();
        urlInput.select();
      }
    });
  }
}

// 监听页面完全加载
window.addEventListener("load", () => {
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
  if (!document.getElementById("vs-go-navigation-bar")) {
    createNavigationBar();
  }
});
