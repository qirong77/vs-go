import React, { useState, useEffect, useCallback, useRef } from "react";
import { message } from "antd";
import { VS_GO_EVENT } from "../../common/EVENT";

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
    </div>
  );
};

export default UserNotes;
