import { useEffect, useRef, useState, useCallback } from "react";

interface ExtensionPopoverProps {
  children?: React.ReactNode;
  content?: React.ReactNode;
  trigger?: 'click' | 'hover';
  placement?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

const CLASS_NAME = "preload-component-extension-popover";
const CONTENT_CLASS_NAME = "preload-component-extension-popover-content";

const Style = (
  <style>{`
.${CLASS_NAME} {
  position: relative;
  display: inline-block;
  cursor: pointer;
}

.${CONTENT_CLASS_NAME} {
  position: fixed;
  z-index: 10000;
  background: #ffffff;
  border: 1px solid #e1e5e9;
  border-radius: 12px;
  box-shadow: 
    0 10px 38px -10px rgba(22, 23, 24, 0.35),
    0 10px 20px -15px rgba(22, 23, 24, 0.2);
  padding: 16px;
  min-width: 240px;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-12px) scale(0.95);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: none;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #374151;
}

.${CONTENT_CLASS_NAME}.visible {
  opacity: 1;
  visibility: visible;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}

.${CONTENT_CLASS_NAME}::before {
  content: '';
  position: absolute;
  top: -8px;
  right: 20px;
  width: 16px;
  height: 16px;
  background: #ffffff;
  border: 1px solid #e1e5e9;
  border-bottom: none;
  border-right: none;
  transform: rotate(45deg);
  z-index: 1;
}

.${CONTENT_CLASS_NAME}::after {
  content: '';
  position: absolute;
  top: -7px;
  right: 21px;
  width: 14px;
  height: 14px;
  background: #ffffff;
  transform: rotate(45deg);
  z-index: 2;
}

/* 滚动条样式 */
.${CONTENT_CLASS_NAME} ::-webkit-scrollbar {
  width: 6px;
}

.${CONTENT_CLASS_NAME} ::-webkit-scrollbar-track {
  background: transparent;
}

.${CONTENT_CLASS_NAME} ::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}

.${CONTENT_CLASS_NAME} ::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2);
}

/* 深色主题适配 */
@media (prefers-color-scheme: dark) {
  .${CONTENT_CLASS_NAME} {
    background: #1f2937;
    border-color: #374151;
    color: #f3f4f6;
    box-shadow: 
      0 10px 38px -10px rgba(0, 0, 0, 0.5),
      0 10px 20px -15px rgba(0, 0, 0, 0.3);
  }
  
  .${CONTENT_CLASS_NAME}::before {
    background: #1f2937;
    border-color: #374151;
  }
  
  .${CONTENT_CLASS_NAME}::after {
    background: #1f2937;
  }
  
  .${CONTENT_CLASS_NAME} ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
  }
  
  .${CONTENT_CLASS_NAME} ::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
  }
}

`}</style>
);

export const ExtensionPopover: React.FC<ExtensionPopoverProps> = ({ 
  children, 
  content, 
  trigger = 'click',
  placement = 'bottom-right' 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentContainerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, right: 0 });
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updatePosition = useCallback(() => {
    if (containerRef.current && contentContainerRef.current) {
      const triggerRect = containerRef.current.getBoundingClientRect();
      const contentRect = contentContainerRef.current.getBoundingClientRect();
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
      };

      let newPosition = { top: 0, left: 0, right: 0 };

      switch (placement) {
        case 'bottom-right':
          newPosition = {
            top: triggerRect.bottom + 8,
            left: triggerRect.right - contentRect.width,
            right: viewport.width - triggerRect.right
          };
          break;
        case 'bottom-left':
          newPosition = {
            top: triggerRect.bottom + 8,
            left: triggerRect.left,
            right: viewport.width - triggerRect.left - contentRect.width
          };
          break;
        case 'top-right':
          newPosition = {
            top: triggerRect.top - contentRect.height - 8,
            left: triggerRect.right - contentRect.width,
            right: viewport.width - triggerRect.right
          };
          break;
        case 'top-left':
          newPosition = {
            top: triggerRect.top - contentRect.height - 8,
            left: triggerRect.left,
            right: viewport.width - triggerRect.left - contentRect.width
          };
          break;
      }

      // 边界检测
      // if (newPosition.top < 8) newPosition.top = triggerRect.bottom + 8;
      // if (newPosition.top + contentRect.height > viewport.height - 8) {
      //   newPosition.top = triggerRect.top - contentRect.height - 8;
      // }
      // if (newPosition.left < 8) newPosition.left = 8;
      // if (newPosition.left + contentRect.width > viewport.width - 8) {
      //   newPosition.left = viewport.width - contentRect.width - 8;
      // }

      setPosition(newPosition);
    }
  }, [placement]);

  const clearHideTimeout = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const handleShow = () => {
    clearHideTimeout();
    setIsVisible(true);
  };

  const handleHide = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 150); // 150ms延迟，允许鼠标移动到弹出内容
  };

  const handleClick = () => {
    if (trigger === 'click') {
      if (isVisible) {
        setIsVisible(false);
      } else {
        handleShow();
      }
    }
  };

  const handleMouseEnter = () => {
    if (trigger === 'hover') {
      handleShow();
    }
  };

  const handleMouseLeave = () => {
    // 只有悬停触发时才在鼠标离开时隐藏
    // 点击触发的popover应该保持显示，直到点击外部或离开内容区域
    if (trigger === 'hover') {
      handleHide();
    }
  };

  const handleContentMouseEnter = () => {
    clearHideTimeout();
  };

  const handleContentMouseLeave = () => {
    // 对于悬停触发的popover，鼠标离开内容区域时隐藏
    // 对于点击触发的popover，鼠标离开内容区域时也隐藏（用户体验更好）
    handleHide();
  };

  const handleContentClick = (e: React.MouseEvent) => {
    // 阻止点击事件冒泡到父容器，防止触发关闭逻辑
    e.stopPropagation();
  };

  useEffect(() => {
    if (isVisible) {
      updatePosition();
      
      const handleResize = () => updatePosition();
      const handleScroll = () => updatePosition();
      const handleClickOutside = (e: MouseEvent) => {
        if (trigger === 'click' && 
            containerRef.current && 
            contentContainerRef.current &&
            !containerRef.current.contains(e.target as Node) &&
            !contentContainerRef.current.contains(e.target as Node)) {
          setIsVisible(false);
        }
      };

      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true);
      document.addEventListener('mousedown', handleClickOutside);

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
    
    return undefined;
  }, [isVisible, updatePosition, trigger]);

  useEffect(() => {
    return () => {
      clearHideTimeout();
    };
  }, [clearHideTimeout]);

  return (
    <>
      {Style}
      <div 
        ref={containerRef}
        className={CLASS_NAME}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div style={{fontSize:'18px'}}>{children}</div>
        <div
          ref={contentContainerRef}
          className={`${CONTENT_CLASS_NAME} ${isVisible ? 'visible' : ''}`}
          style={{
            top: `${position.top}px`,
            left: `${position.left - 10}px`,
          }}
          onMouseEnter={handleContentMouseEnter}
          onMouseLeave={handleContentMouseLeave}
          onClick={handleContentClick}
        >
          {content}
        </div>
      </div>
    </>
  );
};
