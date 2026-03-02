import React, { useState, useEffect, useCallback, useRef } from "react";
import { message } from "antd";
import { VS_GO_EVENT } from "../../common/EVENT";
import { Editor, rootCtx, defaultValueCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { history } from "@milkdown/plugin-history";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import { $prose } from "@milkdown/utils";
import NoteFileTree from "./components/NoteFileTree";
import "./userNotesStyles.css";

// URL 正则表达式
const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

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

// 创建链接粘贴识别插件
const pasteLinkPlugin = () => {
  return $prose(() => {
    return new Plugin({
      key: new PluginKey('pasteLink'),
      props: {
        handlePaste(view, event) {
          const text = event.clipboardData?.getData('text/plain');
          if (!text) return false;
          
          // 检查是否为纯 URL（没有其他文字）
          const trimmedText = text.trim();
          const urlMatch = trimmedText.match(URL_REGEX);
          
          if (urlMatch && urlMatch[0] === trimmedText) {
            // 是纯 URL，转换为 Markdown 链接格式
            event.preventDefault();
            
            const { tr } = view.state;
            const linkNode = view.state.schema.marks.link;
            
            if (linkNode) {
              // 创建带链接的文本节点
              const linkMark = linkNode.create({ href: trimmedText });
              const textNode = view.state.schema.text(trimmedText, [linkMark]);
              
              const transaction = tr.replaceSelectionWith(textNode, false);
              view.dispatch(transaction);
              
              return true;
            }
          }
          
          return false;
        },
      },
    });
  });
};

// 创建链接点击打开插件
const clickableLinkPlugin = () => {
  return $prose(() => {
    return new Plugin({
      key: new PluginKey('clickableLink'),
      props: {
        handleDOMEvents: {
          click(_view, event) {
            const target = event.target as HTMLElement;
            
            // 检查是否点击了链接
            if (target.tagName === 'A') {
              event.preventDefault();
              const href = (target as HTMLAnchorElement).href;
              
              if (href) {
                // 调用 IPC 打开外部链接
                window.electron.ipcRenderer.invoke(
                  VS_GO_EVENT.OPEN_EXTERNAL_URL,
                  href
                ).catch((error) => {
                  console.error('打开链接失败:', error);
                });
                
                return true;
              }
            }
            
            return false;
          },
        },
      },
    });
  });
};

// 图片缩放插件
const imageResizePlugin = () => {
  return $prose(() => {
    let currentResizing: {
      pos: number;
      startX: number;
      startY: number;
      startWidth: number;
      startHeight: number;
      img: HTMLImageElement;
      view: any;
      resizeType: 'width' | 'height' | 'both';
    } | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (!currentResizing) return;
      
      const deltaX = e.clientX - currentResizing.startX;
      const deltaY = e.clientY - currentResizing.startY;
      
      if (currentResizing.resizeType === 'width') {
        // 只调整宽度
        const newWidth = Math.max(50, currentResizing.startWidth + deltaX);
        currentResizing.img.style.width = `${newWidth}px`;
      } else if (currentResizing.resizeType === 'height') {
        // 只调整高度
        const newHeight = Math.max(50, currentResizing.startHeight + deltaY);
        currentResizing.img.style.height = `${newHeight}px`;
      } else {
        // 同时调整宽度和高度（对角线）
        const newWidth = Math.max(50, currentResizing.startWidth + deltaX);
        const newHeight = Math.max(50, currentResizing.startHeight + deltaY);
        currentResizing.img.style.width = `${newWidth}px`;
        currentResizing.img.style.height = `${newHeight}px`;
      }
    };

    const handleMouseUp = () => {
      if (!currentResizing) return;
      
      const { view, pos, img } = currentResizing;
      const newWidth = parseInt(img.style.width) || img.offsetWidth;
      const newHeight = parseInt(img.style.height) || img.offsetHeight;
      
      // 更新 ProseMirror 文档中的图片属性
      const node = view.state.doc.nodeAt(pos);
      if (node) {
        const tr = view.state.tr.setNodeMarkup(pos, null, {
          ...node.attrs,
          title: `width=${newWidth} height=${newHeight}`,
        });
        
        view.dispatch(tr);
      }
      
      currentResizing = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      img.style.cursor = '';
    };

    return new Plugin({
      key: new PluginKey('imageResize'),
      props: {
        decorations(state) {
          const decorations: Decoration[] = [];
          
          // 为每个图片节点应用宽度和高度
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'image' && node.attrs.title) {
              const widthMatch = node.attrs.title.match(/width=(\d+)/);
              const heightMatch = node.attrs.title.match(/height=(\d+)/);
              
              if (widthMatch || heightMatch) {
                const width = widthMatch ? widthMatch[1] : 'auto';
                const height = heightMatch ? heightMatch[1] : 'auto';
                const style = `width: ${width}${width !== 'auto' ? 'px' : ''}; height: ${height}${height !== 'auto' ? 'px' : ''};`;
                
                const decoration = Decoration.node(pos, pos + node.nodeSize, {
                  style,
                });
                decorations.push(decoration);
              }
            }
          });
          
          return DecorationSet.create(state.doc, decorations);
        },
        handleDOMEvents: {
          mousedown(view, event) {
            const target = event.target as HTMLElement;
            
            if (target.tagName === 'IMG') {
              const img = target as HTMLImageElement;
              const pos = view.posAtDOM(img, 0);
              const node = view.state.doc.nodeAt(pos);
              
              if (!node || node.type.name !== 'image') return false;
              
              // 应用已保存的宽度和高度
              if (node.attrs.title) {
                const widthMatch = node.attrs.title.match(/width=(\d+)/);
                const heightMatch = node.attrs.title.match(/height=(\d+)/);
                
                if (widthMatch && !img.style.width) {
                  img.style.width = `${widthMatch[1]}px`;
                }
                if (heightMatch && !img.style.height) {
                  img.style.height = `${heightMatch[1]}px`;
                }
              }
              
              // 检查是否点击了图片的边缘（用于调整大小）
              const rect = img.getBoundingClientRect();
              const edgeSize = 10; // 边缘敏感区域
              const isRightEdge = event.clientX > rect.right - edgeSize;
              const isBottomEdge = event.clientY > rect.bottom - edgeSize;
              
              if (isRightEdge || isBottomEdge) {
                event.preventDefault();
                
                let resizeType: 'width' | 'height' | 'both';
                let cursor: string;
                
                if (isRightEdge && isBottomEdge) {
                  // 右下角：同时缩放宽度和高度
                  resizeType = 'both';
                  cursor = 'nwse-resize';
                } else if (isRightEdge) {
                  // 右边缘：只缩放宽度
                  resizeType = 'width';
                  cursor = 'ew-resize';
                } else {
                  // 底部边缘：只缩放高度
                  resizeType = 'height';
                  cursor = 'ns-resize';
                }
                
                currentResizing = {
                  pos,
                  startX: event.clientX,
                  startY: event.clientY,
                  startWidth: img.offsetWidth,
                  startHeight: img.offsetHeight,
                  img,
                  view,
                  resizeType,
                };
                
                img.style.cursor = cursor;
                
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
                
                return true;
              }
            }
            
            return false;
          },
          mousemove(_view, event) {
            const target = event.target as HTMLElement;
            
            if (target.tagName === 'IMG' && !currentResizing) {
              const img = target as HTMLImageElement;
              const rect = img.getBoundingClientRect();
              const edgeSize = 10;
              const isRightEdge = event.clientX > rect.right - edgeSize;
              const isBottomEdge = event.clientY > rect.bottom - edgeSize;
              
              if (isRightEdge && isBottomEdge) {
                img.style.cursor = 'nwse-resize';
              } else if (isRightEdge) {
                img.style.cursor = 'ew-resize';
              } else if (isBottomEdge) {
                img.style.cursor = 'ns-resize';
              } else {
                img.style.cursor = 'pointer';
              }
            }
            
            return false;
          },
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
      .use(pasteImagePlugin())
      .use(imageResizePlugin())
      .use(pasteLinkPlugin())
      .use(clickableLinkPlugin());
  });

  return <Milkdown />;
};

const UserNotes: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [editorKey, setEditorKey] = useState(0);
  const [currentFileId, setCurrentFileId] = useState<string>("");
  const [currentFileName, setCurrentFileName] = useState<string>("");
  const saveTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // 加载当前文件
  useEffect(() => {
    loadCurrentFile();
  }, []);

  const loadCurrentFile = async () => {
    try {
      setIsLoading(true);
      const fileId = await window.electron.ipcRenderer.invoke(
        VS_GO_EVENT.USER_NOTES_GET_CURRENT_FILE
      );
      
      if (fileId) {
        const fileContent = await window.electron.ipcRenderer.invoke(
          VS_GO_EVENT.USER_NOTES_GET_FILE,
          fileId
        );
        setCurrentFileId(fileId);
        setContent(fileContent || "");
        setEditorKey(prev => prev + 1);
      }
    } catch (error) {
      console.error("加载当前文件失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // 选择文件
  const handleSelectFile = async (fileId: string, fileName: string) => {
    if (fileId === currentFileId) return;
    
    try {
      setIsLoading(true);
      const fileContent = await window.electron.ipcRenderer.invoke(
        VS_GO_EVENT.USER_NOTES_GET_FILE,
        fileId
      );
      
      setCurrentFileId(fileId);
      setCurrentFileName(fileName);
      setContent(fileContent || "");
      setEditorKey(prev => prev + 1);
      
      // 保存当前文件ID
      await window.electron.ipcRenderer.invoke(
        VS_GO_EVENT.USER_NOTES_SET_CURRENT_FILE,
        fileId
      );
    } catch (error) {
      console.error("加载文件失败:", error);
      messageApi.error("加载文件失败");
    } finally {
      setIsLoading(false);
    }
  };

  // 保存文件内容
  const saveFileContent = useCallback(async (newContent: string) => {
    if (!currentFileId) return;
    
    try {
      await window.electron.ipcRenderer.invoke(
        VS_GO_EVENT.USER_NOTES_SAVE_FILE,
        currentFileId,
        newContent
      );
      console.log("笔记已自动保存");
    } catch (error) {
      console.error("保存笔记内容失败:", error);
    }
  }, [currentFileId]);

  // 处理编辑器内容变化
  const handleChange = useCallback(
    (markdown: string) => {
      // 清除之前的定时器
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      // 设置新的定时器，1秒后保存
      saveTimerRef.current = setTimeout(() => {
        saveFileContent(markdown);
      }, 1000);
    },
    [saveFileContent]
  );

  // 组件卸载时清除定时器
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="h-screen flex bg-white user-notes-container">
      {contextHolder}
      
      {/* 左侧文件树 */}
      <div className="note-sidebar">
        <NoteFileTree
          onSelectFile={handleSelectFile}
          selectedFileId={currentFileId}
        />
      </div>

      {/* 右侧编辑区 */}
      <div className="note-editor-area">
        {currentFileId ? (
          <>
            {/* 文件名标题 */}
            {currentFileName && (
              <div className="note-editor-header">
                <span className="note-file-name">{currentFileName}</span>
              </div>
            )}
            
            {/* 编辑器 */}
            <div className="note-editor-content">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-lg text-gray-600">加载中...</div>
                </div>
              ) : (
                <MilkdownProvider key={editorKey}>
                  <MilkdownEditor initialContent={content} onChange={handleChange} />
                </MilkdownProvider>
              )}
            </div>
          </>
        ) : (
          <div className="note-empty-state">
            <div className="note-empty-icon">📝</div>
            <h3>开始记录你的笔记</h3>
            <p>在左侧创建一个新文件开始编写</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserNotes;
