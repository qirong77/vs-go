import React, { useState, useEffect, useCallback, useRef } from "react";
import { message } from "antd";
import { VS_GO_EVENT } from "../../common/EVENT";
import { Editor, rootCtx, defaultValueCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { history } from "@milkdown/plugin-history";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import "./userNotesStyles.css";

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
      .use(history);
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
