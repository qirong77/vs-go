type ToastType = "success" | "error" | "info";

interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
}
let stylesCreated = false;
// 确保容器只创建一次
let container: HTMLDivElement | null = null;
function createToastStyles() {
  // 创建样式
  const style = document.createElement("style");
  style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  .toast-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
  }
  .toast-message {
    padding: 12px 16px;
    border-radius: 6px;
    color: white;
    font-size: 14px;
    min-width: 200px;
    margin-bottom: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    animation: slideIn 0.3s ease-out;
  }
  .toast-success {
    background: #10b981;
  }
  .toast-error {
    background: #ef4444;
  }
  .toast-info {
    background: #3b82f6;
  }
`;
  document.head.appendChild(style);
}
function getContainer(): HTMLDivElement {
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  return container;
}

export function showToast({ message, type = "info", duration = 3000 }: ToastOptions): void {
  if (!stylesCreated) {
    createToastStyles();
    stylesCreated = true;
  }
  const toastElement = document.createElement("div");
  toastElement.className = `toast-message toast-${type}`;
  toastElement.textContent = message;

  const container = getContainer();
  container.appendChild(toastElement);

  // 设置淡出动画
  setTimeout(() => {
    toastElement.style.opacity = "0";
    toastElement.style.transition = "opacity 0.3s ease-out";

    // 动画结束后移除元素
    setTimeout(() => {
      if (toastElement.parentNode) {
        toastElement.parentNode.removeChild(toastElement);
      }
    }, 300);
  }, duration);
}
