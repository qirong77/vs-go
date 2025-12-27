import React, { useState, useEffect, useCallback, useRef } from "react";
import { message } from "antd";
import { VS_GO_EVENT } from "../../common/EVENT";
import { Editor, rootCtx, defaultValueCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { history } from "@milkdown/plugin-history";

const MilkdownEditor: React.FC<{
  initialContent: string;
  onChange: (markdown: string) => void;
}> = ({ initialContent, onChange }) => {
  useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initialContent);
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          onChange(markdown);
        });
      })
      .use(commonmark)
      .use(listener)
      .use(history)
  );

  return <Milkdown />;
};

const UserNotes: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const [content, setContent] = useState<string>("# 开始编写你的笔记\n\n在这里记录你的想法...");
  const [isLoading, setIsLoading] = useState(true);
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
      setContent(markdown);

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
    <div className="h-screen flex flex-col bg-gray-50">
      {contextHolder}
      
      {/* 顶部信息栏 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-gray-800">用户笔记</h1>
          <span className="text-sm text-gray-500">Markdown 编辑器</span>
        </div>
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          自动保存
        </div>
      </div>

      {/* 编辑器内容区域 */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto py-6">
          <div className="bg-white rounded-lg shadow-sm min-h-[calc(100vh-120px)]">
            <MilkdownProvider>
              <MilkdownEditor 
                initialContent={content} 
                onChange={handleChange}
              />
            </MilkdownProvider>
          </div>
        </div>
      </div>

      {/* 使用提示 */}
      <div className="bg-white border-t border-gray-200 px-4 py-2.5 text-xs text-gray-500">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            快捷键：<span className="font-semibold">Ctrl+B</span> 粗体 | 
            <span className="font-semibold ml-2">Ctrl+I</span> 斜体 | 
            <span className="font-semibold ml-2">Ctrl+Z</span> 撤销 | 
            <span className="font-semibold ml-2">Ctrl+Shift+Z</span> 重做
          </div>
          <div>
            Markdown 格式：<span className="font-semibold ml-2"># 标题</span> | 
            <span className="font-semibold ml-2">- 列表</span> | 
            <span className="font-semibold ml-2">`代码`</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserNotes;
