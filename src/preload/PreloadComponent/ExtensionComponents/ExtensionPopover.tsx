import { useEffect, useRef, useState } from "react";

interface ExtensionPopoverProps {
  children?: React.ReactNode;
  content?: React.ReactNode;
  visible?: boolean;
}

const CLASS_NAME = "preload-component-extension-popover";
const CONTENT_CLASS_NAME = "preload-component-extension-popover-content";

const Style = (
  <style>{`
.${CLASS_NAME} {
  position: relative;
  display: inline-block;
}

.${CONTENT_CLASS_NAME} {
  position: fixed;
  z-index: 9999;
  background: #ffffff;
  border: 1px solid #e1e5e9;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 12px;
  min-width: 200px;
  max-width: 400px;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-8px);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: none;
}

.${CONTENT_CLASS_NAME}.visible {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
  pointer-events: auto;
}

.${CONTENT_CLASS_NAME}::before {
  content: '';
  position: absolute;
  top: -6px;
  right: 16px;
  width: 12px;
  height: 12px;
  background: #ffffff;
  border: 1px solid #e1e5e9;
  border-bottom: none;
  border-right: none;
  transform: rotate(45deg);
}

/* 深色主题适配 */
@media (prefers-color-scheme: dark) {
  .${CONTENT_CLASS_NAME} {
    background: #2d2d30;
    border-color: #464647;
    color: #cccccc;
  }
  
  .${CONTENT_CLASS_NAME}::before {
    background: #2d2d30;
    border-color: #464647;
  }
}
`}</style>
);

export const ExtensionPopover: React.FC<ExtensionPopoverProps> = ({ children, content }) => {
  const contentContainerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  useEffect(() => {
    const updatePosition = () => {
      const PreloadComponentDom = document.getElementById("preload-root");
      if (PreloadComponentDom && contentContainerRef.current) {
        const rect = PreloadComponentDom.getBoundingClientRect();
        // const contentRect = contentContainerRef.current.getBoundingClientRect();

        // 计算右下角位置
        const newPosition = {
          top: rect.bottom,
          right: 0,
        };
        console.log(rect)
        setPosition(newPosition);
      }
    };
    updatePosition();

    // 监听窗口大小变化和滚动事件
    const handleResize = () => updatePosition();
    const handleScroll = () => updatePosition();

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  return (
    <>
      {Style}
      <div className={CLASS_NAME}>
        <div>{children}</div>
        <div
          ref={contentContainerRef}
          className={`${CONTENT_CLASS_NAME} visible`}
          style={{
            top: `${position.top}px`,
            right: `${position.right}px`,
          }}
        >
          {content}
        </div>
      </div>
    </>
  );
};
