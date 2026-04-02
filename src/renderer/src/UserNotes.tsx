import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { message, Button } from "antd";
import { HistoryOutlined } from "@ant-design/icons";
import { VS_GO_EVENT } from "../../common/EVENT";
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, commandsCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm, columnResizingPlugin } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { history } from "@milkdown/plugin-history";
import { Milkdown, MilkdownProvider, useEditor, useInstance } from "@milkdown/react";
import { Plugin, PluginKey, TextSelection } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import { $prose } from "@milkdown/utils";
import NoteFileTree from "./components/NoteFileTree";
import NoteHistoryDrawer from "./components/NoteHistoryDrawer";
import { codeBlockAutoLanguagePlugin } from "./milkdownCodeBlockAutoLanguage";
import { codeBlockCollapseView } from "./milkdownCodeBlockCollapse";
import { codeBlockPrismPlugin } from "./milkdownCodeBlockPrism";
import { tableYuquePlugin } from "./milkdownTableYuque";

import "@milkdown/prose/tables/style/tables.css";
import "./userNotesStyles.css";

/** 停止编辑超过该时间后，保存一条历史快照（每次编辑会重新计时） */
const NOTE_HISTORY_IDLE_MS = 30 * 60 * 1000;

// URL 正则表达式
const URL_REGEX =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

// 图片压缩和转换工具函数
const compressImage = async (file: File, maxSizeMB: number = 0.5): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement("canvas");
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

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("无法获取 canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // 判断是否为 PNG 或者需要压缩
        const isPNG = file.type === "image/png";
        const fileType = isPNG ? "image/jpeg" : file.type;

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

      img.onerror = () => reject(new Error("图片加载失败"));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
};

// 创建粘贴图片插件
const pasteImagePlugin = () => {
  return $prose(() => {
    return new Plugin({
      key: new PluginKey("pasteImage"),
      props: {
        handlePaste(view, event) {
          const items = event.clipboardData?.items;
          if (!items) return false;

          for (let i = 0; i < items.length; i++) {
            const item = items[i];

            if (item.type.indexOf("image") !== -1) {
              event.preventDefault();

              const file = item.getAsFile();
              if (!file) continue;

              // 检查文件大小
              const fileSizeMB = file.size / (1024 * 1024);
              const needsCompression = fileSizeMB > 0.5 || file.type === "image/png";

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

                    console.log("图片已压缩并插入");
                  })
                  .catch((error) => {
                    console.error("图片处理失败:", error);
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
      key: new PluginKey("pasteLink"),
      props: {
        handlePaste(view, event) {
          // 如果剪贴板有 HTML 内容，让编辑器默认处理（保留链接等格式）
          const html = event.clipboardData?.getData("text/html");
          if (html) return false;

          const text = event.clipboardData?.getData("text/plain");
          if (!text) return false;

          const trimmedText = text.trim();

          // 检查文本中是否包含 URL
          const urlMatch = trimmedText.match(URL_REGEX);
          if (!urlMatch) return false;

          event.preventDefault();

          const { tr } = view.state;
          const linkMark = view.state.schema.marks.link;
          if (!linkMark) return false;

          // 将文本按 URL 分段，分别创建普通文本节点和链接文本节点
          const nodes: any[] = [];
          let lastIndex = 0;

          // 重新创建正则以重置 lastIndex
          const urlRegex = new RegExp(URL_REGEX.source, "gi");
          let match: RegExpExecArray | null;

          while ((match = urlRegex.exec(trimmedText)) !== null) {
            // 添加 URL 前面的普通文本
            if (match.index > lastIndex) {
              const plainText = trimmedText.slice(lastIndex, match.index);
              nodes.push(view.state.schema.text(plainText));
            }

            // 添加链接文本节点
            const url = match[0];
            const mark = linkMark.create({ href: url });
            nodes.push(view.state.schema.text(url, [mark]));

            lastIndex = match.index + url.length;
          }

          // 添加最后剩余的普通文本
          if (lastIndex < trimmedText.length) {
            const plainText = trimmedText.slice(lastIndex);
            nodes.push(view.state.schema.text(plainText));
          }

          if (nodes.length > 0) {
            const fragment = view.state.schema.nodes.paragraph.create(null, nodes);
            const transaction = tr.replaceSelectionWith(fragment, false);
            view.dispatch(transaction);
            return true;
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
      key: new PluginKey("clickableLink"),
      props: {
        handleDOMEvents: {
          click(_view, event) {
            const target = event.target as HTMLElement;

            // 检查是否点击了链接
            if (target.tagName === "A") {
              event.preventDefault();
              const href = (target as HTMLAnchorElement).href;

              if (href) {
                // 调用 IPC 打开外部链接
                window.electron.ipcRenderer
                  .invoke(VS_GO_EVENT.OPEN_EXTERNAL_URL, href)
                  .catch((error) => {
                    console.error("打开链接失败:", error);
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
      resizeType: "width" | "height" | "both";
    } | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (!currentResizing) return;

      const deltaX = e.clientX - currentResizing.startX;
      const deltaY = e.clientY - currentResizing.startY;

      if (currentResizing.resizeType === "width") {
        // 只调整宽度
        const newWidth = Math.max(50, currentResizing.startWidth + deltaX);
        currentResizing.img.style.width = `${newWidth}px`;
      } else if (currentResizing.resizeType === "height") {
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
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      img.style.cursor = "";
    };

    return new Plugin({
      key: new PluginKey("imageResize"),
      props: {
        decorations(state) {
          const decorations: Decoration[] = [];

          // 为每个图片节点应用宽度和高度
          state.doc.descendants((node, pos) => {
            if (node.type.name === "image" && node.attrs.title) {
              const widthMatch = node.attrs.title.match(/width=(\d+)/);
              const heightMatch = node.attrs.title.match(/height=(\d+)/);

              if (widthMatch || heightMatch) {
                const width = widthMatch ? widthMatch[1] : "auto";
                const height = heightMatch ? heightMatch[1] : "auto";
                const style = `width: ${width}${width !== "auto" ? "px" : ""}; height: ${height}${height !== "auto" ? "px" : ""};`;

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

            if (target.tagName === "IMG") {
              const img = target as HTMLImageElement;
              const pos = view.posAtDOM(img, 0);
              const node = view.state.doc.nodeAt(pos);

              if (!node || node.type.name !== "image") return false;

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

                let resizeType: "width" | "height" | "both";
                let cursor: string;

                if (isRightEdge && isBottomEdge) {
                  // 右下角：同时缩放宽度和高度
                  resizeType = "both";
                  cursor = "nwse-resize";
                } else if (isRightEdge) {
                  // 右边缘：只缩放宽度
                  resizeType = "width";
                  cursor = "ew-resize";
                } else {
                  // 底部边缘：只缩放高度
                  resizeType = "height";
                  cursor = "ns-resize";
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

                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);

                return true;
              }
            }

            return false;
          },
          mousemove(_view, event) {
            const target = event.target as HTMLElement;

            if (target.tagName === "IMG" && !currentResizing) {
              const img = target as HTMLImageElement;
              const rect = img.getBoundingClientRect();
              const edgeSize = 10;
              const isRightEdge = event.clientX > rect.right - edgeSize;
              const isBottomEdge = event.clientY > rect.bottom - edgeSize;

              if (isRightEdge && isBottomEdge) {
                img.style.cursor = "nwse-resize";
              } else if (isRightEdge) {
                img.style.cursor = "ew-resize";
              } else if (isBottomEdge) {
                img.style.cursor = "ns-resize";
              } else {
                img.style.cursor = "pointer";
              }
            }

            return false;
          },
        },
      },
    });
  });
};

// 斜杠命令菜单组件
const SlashMenu: React.FC<{
  show: boolean;
  pos: { top: number; left: number };
  slashPos: number | null;
  /** 与 handleTextInput 同步写入，执行命令时优先用 ref，避免 state 滞后导致删错位置 */
  slashPosRef: React.MutableRefObject<number | null>;
  onClose: () => void;
}> = ({ show, pos, slashPos, slashPosRef, onClose }) => {
  // useInstance 返回 [loading, getInstance]：就绪时第一项为 false，第二项返回 Editor
  const [, getInstance] = useInstance();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedIndexRef = useRef(0);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  // 仅在菜单打开时重置高亮，不可放在「监听键盘」的 effect 里，否则会随 selectedIndex 变化反复执行并清零
  useEffect(() => {
    if (!show) return;
    setSelectedIndex(0);
    selectedIndexRef.current = 0;
  }, [show]);

  // 使用命令注册名（与 $command('InsertTable', …) 一致），勿用 *.key：首屏 useMemo 时 key 可能尚未注入
  const items = useMemo(
    () =>
      [
        { label: "表格", icon: "📊", command: "InsertTable" as const },
        // { label: "一级标题", icon: "H1", command: wrapInHeadingCommand.key, args: 1 },
        // { label: "二级标题", icon: "H2", command: wrapInHeadingCommand.key, args: 2 },
        // { label: "三级标题", icon: "H3", command: wrapInHeadingCommand.key, args: 3 },
        // { label: "无序列表", icon: "•", command: wrapInBulletListCommand.key },
        // { label: "有序列表", icon: "1.", command: wrapInOrderedListCommand.key },
        { label: "代码块", icon: "```", command: "CreateCodeBlock" as const },
        { label: "分割线", icon: "—", command: "InsertHr" as const },
      ] as const,
    []
  );

  const executeCommand = useCallback(
    (item: any) => {
      const pos = slashPosRef.current ?? slashPos;
      const editor = getInstance();
      if (!editor) return;
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const commands = ctx.get(commandsCtx);

        view.focus();

        let { state } = view;
        if (pos !== null) {
          const max = state.doc.content.size;
          if (pos >= 0 && pos + 1 <= max) {
            view.dispatch(state.tr.delete(pos, pos + 1));
            state = view.state;
            const anchor = Math.min(pos, state.doc.content.size);
            const $pos = state.doc.resolve(anchor);
            view.dispatch(state.tr.setSelection(TextSelection.near($pos)));
          }
        }

        if (item.args !== undefined) {
          commands.call(item.command, item.args);
        } else {
          commands.call(item.command);
        }
      });
      onClose();
    },
    [getInstance, slashPos, onClose, slashPosRef]
  );

  useEffect(() => {
    if (!show) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        executeCommand(items[selectedIndexRef.current]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [show, items, executeCommand, onClose]);

  if (!show) return null;

  return (
    <div
      className="slash-menu"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {items.map((item, index) => (
        <div
          key={item.label}
          className={`slash-menu-item ${index === selectedIndex ? "selected" : ""}`}
          onClick={() => executeCommand(item)}
          onMouseEnter={() => {
            setSelectedIndex(index);
            selectedIndexRef.current = index;
          }}
        >
          <div className="icon">{item.icon}</div>
          <div className="label">{item.label}</div>
        </div>
      ))}
    </div>
  );
};

// 编辑器组件
const MilkdownEditor: React.FC<{
  initialContent: string;
  onChange: (markdown: string) => void;
}> = ({ initialContent, onChange }) => {
  const onChangeRef = useRef(onChange);
  const [slashState, setSlashState] = useState({ show: false, pos: { top: 0, left: 0 } });
  const [slashPos, setSlashPos] = useState<number | null>(null);
  const slashStateRef = useRef(setSlashState);
  const slashPosRef = useRef<number | null>(null);
  const setSlashPosRef = useRef(setSlashPos);
  setSlashPosRef.current = setSlashPos;
  const slashShowRef = useRef(false);

  // 保持 onChange 引用最新
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    slashStateRef.current = setSlashState;
    slashShowRef.current = false;
  }, []);

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
      .use(codeBlockCollapseView)
      .use(codeBlockAutoLanguagePlugin)
      .use(codeBlockPrismPlugin)
      .use(gfm)
      .use(columnResizingPlugin)
      .use(tableYuquePlugin)
      .use(
        $prose(
          () =>
            new Plugin({
              key: new PluginKey("slashMenuTrigger"),
              props: {
                handleTextInput(view, from, _to, text) {
                  if (text === "/") {
                    const coords = view.coordsAtPos(from);
                    slashPosRef.current = from;
                    setSlashPosRef.current(from);
                    slashShowRef.current = true;
                    slashStateRef.current({
                      show: true,
                      pos: { top: coords.bottom + 5, left: coords.left },
                    });
                  } else {
                    slashShowRef.current = false;
                    slashStateRef.current((s) => (s.show ? { ...s, show: false } : s));
                    slashPosRef.current = null;
                    setSlashPosRef.current(null);
                  }
                  return false;
                },
                handleKeyDown(_view, event) {
                  if (event.key === "Escape" || event.key === "Backspace") {
                    slashShowRef.current = false;
                    slashStateRef.current((s) => (s.show ? { ...s, show: false } : s));
                    slashPosRef.current = null;
                    setSlashPosRef.current(null);
                    return false;
                  }
                  if (slashShowRef.current) {
                    const chars = "/-·*+1.#!_~`";
                    if (
                      !chars.includes(event.key) &&
                      !event.ctrlKey &&
                      !event.metaKey &&
                      event.key.length === 1
                    ) {
                      slashShowRef.current = false;
                      slashStateRef.current({ show: false, pos: { top: 0, left: 0 } });
                      slashPosRef.current = null;
                      setSlashPosRef.current(null);
                      return false;
                    }
                  }
                  return false;
                },
                handleClick() {
                  slashStateRef.current((s) => (s.show ? { ...s, show: false } : s));
                  slashPosRef.current = null;
                  setSlashPosRef.current(null);
                  return false;
                },
              },
            })
        )
      )
      .use(listener)
      .use(history)
      .use(pasteImagePlugin())
      .use(imageResizePlugin())
      .use(pasteLinkPlugin())
      .use(clickableLinkPlugin());
  });

  return (
    <>
      <Milkdown />
      <SlashMenu
        show={slashState.show}
        pos={slashState.pos}
        slashPos={slashPos}
        slashPosRef={slashPosRef}
        onClose={() => {
          setSlashState({ show: false, pos: { top: 0, left: 0 } });
          slashPosRef.current = null;
          setSlashPos(null);
        }}
      />
    </>
  );
};

const UserNotes: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [editorKey, setEditorKey] = useState(0);
  const [currentFileId, setCurrentFileId] = useState<string>("");
  const [currentFileName, setCurrentFileName] = useState<string>("");
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const saveTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const contentRef = useRef("");
  const historyIdleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  const clearHistoryIdleTimer = useCallback(() => {
    if (historyIdleTimerRef.current) {
      clearTimeout(historyIdleTimerRef.current);
      historyIdleTimerRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    clearHistoryIdleTimer();
  }, [currentFileId, clearHistoryIdleTimer]);

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
        setEditorKey((prev) => prev + 1);
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
      setEditorKey((prev) => prev + 1);

      // 保存当前文件ID
      await window.electron.ipcRenderer.invoke(VS_GO_EVENT.USER_NOTES_SET_CURRENT_FILE, fileId);
    } catch (error) {
      console.error("加载文件失败:", error);
      messageApi.error("加载文件失败");
    } finally {
      setIsLoading(false);
    }
  };

  // 保存文件内容
  const saveFileContent = useCallback(
    async (newContent: string) => {
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
    },
    [currentFileId]
  );

  // 处理编辑器内容变化（含：防抖落盘 + 30 分钟无编辑则记一条历史快照）
  const handleChange = useCallback(
    (markdown: string) => {
      contentRef.current = markdown;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        saveFileContent(markdown);
      }, 1000);

      clearHistoryIdleTimer();
      if (!currentFileId) return;
      historyIdleTimerRef.current = setTimeout(async () => {
        try {
          await window.electron.ipcRenderer.invoke(
            VS_GO_EVENT.USER_NOTES_HISTORY_APPEND_SNAPSHOT,
            currentFileId,
            contentRef.current
          );
          messageApi.success("已保存一条历史版本");
        } catch (error) {
          console.error("保存历史版本失败:", error);
        }
      }, NOTE_HISTORY_IDLE_MS);
    },
    [currentFileId, saveFileContent, clearHistoryIdleTimer, messageApi]
  );

  const handleRestoreFromHistory = useCallback(
    async (markdown: string) => {
      setContent(markdown);
      setEditorKey((k) => k + 1);
      await saveFileContent(markdown);
      messageApi.success("已恢复为该历史版本");
    },
    [saveFileContent, messageApi]
  );

  // 组件卸载时清除定时器
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      clearHistoryIdleTimer();
    };
  }, [clearHistoryIdleTimer]);

  return (
    <div className="h-screen flex bg-white user-notes-container">
      {contextHolder}

      {/* 左侧文件树 */}
      <div className="note-sidebar">
        <NoteFileTree onSelectFile={handleSelectFile} selectedFileId={currentFileId} />
      </div>

      {/* 右侧编辑区 */}
      <div className="note-editor-area">
        {currentFileId ? (
          <>
            <div className="note-editor-header">
              <span className="note-file-name">{currentFileName || "笔记"}</span>
              <Button
                type="text"
                size="small"
                className="note-history-trigger"
                icon={<HistoryOutlined />}
                onClick={() => setHistoryDrawerOpen(true)}
              >
                历史版本
              </Button>
            </div>

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

            <NoteHistoryDrawer
              fileId={currentFileId}
              open={historyDrawerOpen}
              onClose={() => setHistoryDrawerOpen(false)}
              onRestore={handleRestoreFromHistory}
            />
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
