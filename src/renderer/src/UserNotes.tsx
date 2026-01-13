import React, { useState, useEffect, useCallback, useRef } from "react";
import { message } from "antd";
import { VS_GO_EVENT } from "../../common/EVENT";
import { Editor, rootCtx, defaultValueCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { history } from "@milkdown/plugin-history";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { $prose } from "@milkdown/utils";
import "./userNotesStyles.css";

// 图片压缩和转换工具函数
const compressImage = async (file: File, maxSizeMB: number = 0.5): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // 如果图片太大，按比例缩小
        const MAX_WIDTH = 1920;
        const MAX_HEIGHT = 1080;
        
        if (width > MAX_WIDTH) {
          height = (height * MAX_WIDTH) / width;
          width = MAX_WIDTH;
        }
        
        if (height > MAX_HEIGHT) {
          width = (width * MAX_HEIGHT) / height;
          height = MAX_HEIGHT;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法获取 canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        // 判断是否为 PNG 或者需要压缩
        const isPNG = file.type === 'image/png';
        const fileType = isPNG ? 'image/jpeg' : file.type;
        
        // 尝试不同的质量级别直到满足大小要求
        let quality = 0.9;
        const maxSize = maxSizeMB * 1024 * 1024;
        
        const tryCompress = () => {
          const base64 = canvas.toDataURL(fileType, quality);
          const base64Size = (base64.length * 3) / 4; // 估算 base64 大小
          
          if (base64Size > maxSize && quality > 0.1) {
            quality -= 0.1;
            tryCompress();
          } else {
            resolve(base64);
          }
        };
        
        tryCompress();
      };
      
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
};

// 创建粘贴图片插件
const pasteImagePlugin = () => {
  return $prose(() => {
    return new Plugin({
      key: new PluginKey('pasteImage'),
      props: {
        handlePaste(view, event) {
          const items = event.clipboardData?.items;
          if (!items) return false;
          
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            if (item.type.indexOf('image') !== -1) {
              event.preventDefault();
              
              const file = item.getAsFile();
              if (!file) continue;
              
              // 检查文件大小
              const fileSizeMB = file.size / (1024 * 1024);
              const needsCompression = fileSizeMB > 0.5 || file.type === 'image/png';
              
              if (needsCompression) {
                // 显示压缩提示
                console.log(`正在处理图片 (${fileSizeMB.toFixed(2)}MB)...`);
                
                compressImage(file, 0.5)
                  .then((base64) => {
                    const { tr } = view.state;
                    const imageNode = view.state.schema.nodes.image;
                    
                    if (imageNode) {
                      const node = imageNode.create({
                        src: base64,
                        alt: file.name,
                      });
                      
                      const transaction = tr.replaceSelectionWith(node);
                      view.dispatch(transaction);
                    }
                    
                    console.log('图片已压缩并插入');
                  })
                  .catch((error) => {
                    console.error('图片处理失败:', error);
                  });
              } else {
                // 直接转换为 base64
                const reader = new FileReader();
                reader.onload = (e) => {
                  const base64 = e.target?.result as string;
                  const { tr } = view.state;
                  const imageNode = view.state.schema.nodes.image;
                  
                  if (imageNode) {
                    const node = imageNode.create({
                      src: base64,
                      alt: file.name,
                    });
                    
                    const transaction = tr.replaceSelectionWith(node);
                    view.dispatch(transaction);
                  }
                };
                reader.readAsDataURL(file);
              }
              
              return true;
            }
          }
          
          return false;
        },
      },
    });
  });
};

// 编辑器组件
const MilkdownEditor: React.FC<{
  initialContent: string;
  onChange: (markdown: string) => void;
}> = ({ initialContent, onChange }) => {
  const onChangeRef = useRef(onChange);
  
  // 保持 onChange 引用最新
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  
  useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initialContent);
        
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          onChangeRef.current(markdown);
        });
      })
      .use(commonmark)
      .use(listener)
      .use(history)
      .use(pasteImagePlugin());
  });

  return <Milkdown />;
};

const UserNotes: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const [content, setContent] = useState<string>("# 开始编写你的笔记\n\n在这里记录你的想法...");
  const [isLoading, setIsLoading] = useState(true);
  const [editorKey, setEditorKey] = useState(0);
  const saveTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // 加载笔记内容
  useEffect(() => {
    loadNoteContent();
  }, []);

  const loadNoteContent = async () => {
    try {
      setIsLoading(true);
      const savedContent = await window.electron.ipcRenderer.invoke(
        VS_GO_EVENT.USER_NOTES_GET_CONTENT
      );
      
      if (savedContent && savedContent.trim()) {
        setContent(savedContent);
        setEditorKey(prev => prev + 1); // 触发编辑器重新渲染
      }
    } catch (error) {
      console.error("加载笔记内容失败:", error);
      messageApi.error("加载笔记失败");
    } finally {
      setIsLoading(false);
    }
  };

  // 保存笔记内容
  const saveNoteContent = useCallback(async (newContent: string) => {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        VS_GO_EVENT.USER_NOTES_SAVE_CONTENT,
        newContent
      );
      
      if (result.success) {
        console.log("笔记已自动保存");
      }
    } catch (error) {
      console.error("保存笔记内容失败:", error);
    }
  }, []);

  // 处理编辑器内容变化
  const handleChange = useCallback(
    (markdown: string) => {
      // 不再更新 content 状态，避免触发编辑器重新渲染
      
      // 清除之前的定时器
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      // 设置新的定时器，1秒后保存
      saveTimerRef.current = setTimeout(() => {
        saveNoteContent(markdown);
      }, 1000);
    },
    [saveNoteContent]
  );

  // 组件卸载时清除定时器
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-lg text-gray-600">加载中...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      {contextHolder}
      <div className="flex-1 overflow-auto">
        <div>
          <MilkdownProvider key={editorKey}>
            <MilkdownEditor initialContent={content} onChange={handleChange} />
          </MilkdownProvider>
        </div>
      </div>
    </div>
  );
};

export default UserNotes;
