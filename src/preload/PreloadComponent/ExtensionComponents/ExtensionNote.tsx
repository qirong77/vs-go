import React, { useState, useEffect, useRef, useCallback } from "react";
import { ExtensionPopover } from "./ExtensionPopover";
import { VS_GO_EVENT } from "../../../common/EVENT";
import { NoteItem } from "../../../common/type";
import { ipcRenderer } from "electron";



interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

// 富文本编辑器工具栏按钮
const ToolbarButton: React.FC<{
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}> = ({ active, onClick, children, title }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      padding: '4px 8px',
      border: '1px solid #d1d5db',
      borderRadius: '4px',
      background: active ? '#3b82f6' : '#ffffff',
      color: active ? 'white' : '#374151',
      cursor: 'pointer',
      fontSize: '12px',
      display: 'flex',
      alignItems: 'center',
      minWidth: '28px',
      justifyContent: 'center',
      transition: 'all 0.2s ease'
    }}
    onMouseEnter={(e) => {
      if (!active) {
        e.currentTarget.style.background = '#f3f4f6';
      }
    }}
    onMouseLeave={(e) => {
      if (!active) {
        e.currentTarget.style.background = '#ffffff';
      }
    }}
  >
    {children}
  </button>
);

export const ExtensionNote: React.FC = () => {
  const [currentNote, setCurrentNote] = useState<NoteItem | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [allNotes, setAllNotes] = useState<NoteItem[]>([]);
  const [showNotesList, setShowNotesList] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);

  // Toast 消息系统
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).slice(2);
    const toast: ToastMessage = { id, message, type };
    setToasts(prev => [...prev, toast]);
    
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  // 加载当前页面的笔记
  const loadCurrentNote = useCallback(async () => {
    try {
      const url = window.location.href;
      const note = await ipcRenderer.invoke(VS_GO_EVENT.NOTE_GET_BY_URL, url);
      if (note) {
        setCurrentNote(note);
        setTitle(note.title);
        const contentStr = typeof note.content === 'string' 
          ? note.content 
          : Array.isArray(note.content) 
            ? note.content.join('') 
            : JSON.stringify(note.content) || '';
        setContent(contentStr);
        if (editorRef.current) {
          editorRef.current.innerHTML = contentStr;
        }
      } else {
        setCurrentNote(null);
        setTitle(document.title || window.location.hostname);
        setContent('');
        if (editorRef.current) {
          editorRef.current.innerHTML = '';
        }
      }
    } catch (error) {
      console.error('加载笔记失败:', error);
    }
  }, []);

  // 加载所有笔记
  const loadAllNotes = useCallback(async () => {
    try {
      const notes = await ipcRenderer.invoke(VS_GO_EVENT.NOTE_GET_ALL);
      setAllNotes(notes);
    } catch (error) {
      console.error('加载所有笔记失败:', error);
    }
  }, []);

  // 保存笔记
  const saveNote = async () => {
    if (!content.trim() && !title.trim()) {
      showToast('笔记内容不能为空', 'error');
      return;
    }

    try {
      setLoading(true);
      const noteData = {
        id: currentNote?.id,
        url: window.location.href,
        domain: window.location.hostname,
        title: title.trim() || document.title || window.location.hostname,
        content: editorRef.current?.innerHTML || content,
        createTime: currentNote?.createTime,
        createTimeDisplay: currentNote?.createTimeDisplay,
      };

      const result = await ipcRenderer.invoke(VS_GO_EVENT.NOTE_SAVE, noteData);
      
      if (result.success) {
        setCurrentNote(result.note);
        showToast(result.isUpdate ? '笔记更新成功' : '笔记保存成功', 'success');
        await loadAllNotes();
      } else {
        showToast(`保存失败: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('保存笔记失败:', error);
      showToast('保存笔记失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 删除笔记
  const deleteNote = async (noteId: string) => {
    if (!confirm('确定要删除这条笔记吗？')) return;

    try {
      const result = await ipcRenderer.invoke(VS_GO_EVENT.NOTE_DELETE, noteId);
      if (result.success) {
        showToast('笔记删除成功', 'success');
        if (currentNote?.id === noteId) {
          setCurrentNote(null);
          setTitle('');
          setContent('');
          if (editorRef.current) {
            editorRef.current.innerHTML = '';
          }
        }
        await loadAllNotes();
      } else {
        showToast('删除失败', 'error');
      }
    } catch (error) {
      console.error('删除笔记失败:', error);
      showToast('删除笔记失败', 'error');
    }
  };

  // 清空编辑器
  const clearEditor = () => {
    if (content.trim() && !confirm('确定要清空编辑器内容吗？')) return;
    
    setContent('');
    if (editorRef.current) {
      editorRef.current.innerHTML = '';
    }
    showToast('编辑器已清空', 'info');
  };

  // 富文本编辑功能
  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      setContent(editorRef.current.innerHTML);
    }
  };

  // 获取当前选中文本的格式状态
  const isFormatActive = (format: string) => {
    return document.queryCommandState(format);
  };

  // 插入链接
  const insertLink = () => {
    const url = prompt('请输入链接地址:');
    if (url) {
      execCommand('createLink', url);
    }
  };

  // 组件加载时获取笔记
  useEffect(() => {
    loadCurrentNote();
    loadAllNotes();
  }, [loadCurrentNote, loadAllNotes]);

  // 过滤笔记列表
  const filteredNotes = allNotes.filter(note => 
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (typeof note.content === 'string' ? note.content : JSON.stringify(note.content))
      .toLowerCase().includes(searchQuery.toLowerCase())
  );

  const noteContent = (
    <>
      <style>{`
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
        .rich-editor {
          min-height: 200px;
          max-height: 300px;
          overflow-y: auto;
          padding: 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          outline: none;
          font-size: 14px;
          line-height: 1.5;
          background: white;
        }
        .rich-editor:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 1px #3b82f6;
        }
        .rich-editor p {
          margin: 8px 0;
        }
        .rich-editor h1, .rich-editor h2, .rich-editor h3 {
          margin: 12px 0 8px 0;
          font-weight: 600;
        }
        .rich-editor h1 { font-size: 18px; }
        .rich-editor h2 { font-size: 16px; }
        .rich-editor h3 { font-size: 14px; }
        .rich-editor ul, .rich-editor ol {
          margin: 8px 0;
          padding-left: 20px;
        }
        .rich-editor blockquote {
          margin: 8px 0;
          padding: 8px 12px;
          border-left: 4px solid #d1d5db;
          background: #f9fafb;
          font-style: italic;
        }
        .rich-editor a {
          color: #3b82f6;
          text-decoration: underline;
        }
        .rich-editor code {
          background: #f1f5f9;
          padding: 2px 4px;
          border-radius: 3px;
          font-family: monospace;
          font-size: 13px;
        }
        .note-item:hover {
          background-color: #f9fafb;
          transform: translateY(-1px);
        }
        .note-item {
          transition: all 0.2s ease;
        }
      `}</style>
      <div style={{ width: '500px', maxHeight: '600px', overflow: 'hidden', position: 'relative' }}>
        {/* Toast 消息 */}
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{
              position: 'fixed',
              top: '20px',
              right: '20px',
              padding: '12px 16px',
              borderRadius: '6px',
              color: 'white',
              fontSize: '14px',
              zIndex: 10000,
              minWidth: '200px',
              background: toast.type === 'success' ? '#10b981' : 
                        toast.type === 'error' ? '#ef4444' : '#3b82f6',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              animation: 'slideIn 0.3s ease-out'
            }}
          >
            {toast.message}
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: '0', fontSize: '16px', fontWeight: 600, color: '#1f2937' }}>
            网页笔记
          </h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setShowNotesList(!showNotesList)}
              style={{
                padding: '4px 8px',
                background: showNotesList ? '#3b82f6' : '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              {showNotesList ? '编辑' : '浏览'}
            </button>
          </div>
        </div>

        {showNotesList ? (
          // 笔记列表视图
          <div>
            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                placeholder="搜索笔记..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>
            
            <div style={{ maxHeight: '400px', overflow: 'auto' }}>
              {filteredNotes.length === 0 ? (
                <div style={{ 
                  textAlign: 'center', 
                  color: '#6b7280', 
                  fontSize: '14px', 
                  padding: '40px 20px',
                  fontStyle: 'italic'
                }}>
                  {searchQuery ? '没有找到匹配的笔记' : '暂无保存的笔记'}
                </div>
              ) : (
                filteredNotes.map((note) => (
                  <div 
                    key={note.id}
                    className="note-item"
                    style={{
                      padding: '12px',
                      marginBottom: '8px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      background: '#ffffff',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      setCurrentNote(note);
                      setTitle(note.title);
                      const contentStr = typeof note.content === 'string' 
                        ? note.content 
                        : Array.isArray(note.content) 
                          ? note.content.join('') 
                          : JSON.stringify(note.content);
                      setContent(contentStr);
                      if (editorRef.current) {
                        editorRef.current.innerHTML = contentStr;
                      }
                      setShowNotesList(false);
                    }}
                  >
                    <div style={{ 
                      fontSize: '14px', 
                      fontWeight: 500, 
                      color: '#1f2937',
                      marginBottom: '4px'
                    }}>
                      {note.title}
                    </div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: '#6b7280',
                      marginBottom: '4px'
                    }}>
                      {note.domain} • {note.updateTimeDisplay}
                    </div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: '#9ca3af',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {(() => {
                        const contentStr = typeof note.content === 'string' 
                          ? note.content 
                          : Array.isArray(note.content) 
                            ? note.content.join('') 
                            : JSON.stringify(note.content);
                        return contentStr.replace(/<[^>]*>/g, '').substring(0, 100);
                      })()}...
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'flex-end',
                      marginTop: '8px'
                    }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNote(note.id);
                        }}
                        style={{
                          padding: '4px 8px',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          // 编辑视图
          <div>
            {/* 标题输入框 */}
            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                placeholder="笔记标题..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  outline: 'none'
                }}
              />
            </div>

            {/* 富文本工具栏 */}
            <div style={{ 
              display: 'flex', 
              gap: '4px', 
              marginBottom: '8px', 
              padding: '8px',
              background: '#f8f9fa',
              borderRadius: '6px',
              flexWrap: 'wrap'
            }}>
              <ToolbarButton
                active={isFormatActive('bold')}
                onClick={() => execCommand('bold')}
                title="粗体"
              >
                <strong>B</strong>
              </ToolbarButton>
              <ToolbarButton
                active={isFormatActive('italic')}
                onClick={() => execCommand('italic')}
                title="斜体"
              >
                <em>I</em>
              </ToolbarButton>
              <ToolbarButton
                active={isFormatActive('underline')}
                onClick={() => execCommand('underline')}
                title="下划线"
              >
                <u>U</u>
              </ToolbarButton>
              <div style={{ width: '1px', background: '#d1d5db', margin: '0 4px' }}></div>
              <ToolbarButton
                onClick={() => execCommand('formatBlock', 'h1')}
                title="标题1"
              >
                H1
              </ToolbarButton>
              <ToolbarButton
                onClick={() => execCommand('formatBlock', 'h2')}
                title="标题2"
              >
                H2
              </ToolbarButton>
              <ToolbarButton
                onClick={() => execCommand('formatBlock', 'h3')}
                title="标题3"
              >
                H3
              </ToolbarButton>
              <div style={{ width: '1px', background: '#d1d5db', margin: '0 4px' }}></div>
              <ToolbarButton
                onClick={() => execCommand('insertUnorderedList')}
                title="无序列表"
              >
                •
              </ToolbarButton>
              <ToolbarButton
                onClick={() => execCommand('insertOrderedList')}
                title="有序列表"
              >
                1.
              </ToolbarButton>
              <ToolbarButton
                onClick={() => execCommand('formatBlock', 'blockquote')}
                title="引用"
              >
                ❝
              </ToolbarButton>
              <ToolbarButton
                onClick={insertLink}
                title="插入链接"
              >
                🔗
              </ToolbarButton>
            </div>

            {/* 富文本编辑器 */}
            <div
              ref={editorRef}
              className="rich-editor"
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => {
                setContent(e.currentTarget.innerHTML);
              }}
              onKeyDown={(e) => {
                // 处理快捷键
                if (e.ctrlKey || e.metaKey) {
                  switch (e.key) {
                    case 'b':
                      e.preventDefault();
                      execCommand('bold');
                      break;
                    case 'i':
                      e.preventDefault();
                      execCommand('italic');
                      break;
                    case 'u':
                      e.preventDefault();
                      execCommand('underline');
                      break;
                    case 's':
                      e.preventDefault();
                      saveNote();
                      break;
                  }
                }
              }}
              style={{ minHeight: '180px' }}
            >
            </div>

            {/* 底部操作栏 */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginTop: '12px',
              padding: '8px 0'
            }}>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {window.location.hostname}
                {currentNote && (
                  <span> • 上次更新: {currentNote.updateTimeDisplay}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={clearEditor}
                  style={{
                    padding: '6px 12px',
                    background: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  清空
                </button>
                <button 
                  onClick={saveNote}
                  disabled={loading}
                  style={{
                    padding: '6px 12px',
                    background: loading ? '#9ca3af' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );

  return (
    <ExtensionPopover 
      content={noteContent}
      trigger="click"
      placement="bottom-right"
    >
      <div style={{
        width: '28px',
        height: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '6px',
        fontSize: '14px',
        transition: 'background-color 0.2s ease'
      }}>
        📝
      </div>
    </ExtensionPopover>
  );
};
