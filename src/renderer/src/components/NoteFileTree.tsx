import React, { useState, useRef, useEffect } from "react";
import { FileAddOutlined, FolderAddOutlined } from "@ant-design/icons";
import { VS_GO_EVENT } from "../../../common/EVENT";
import "./NoteFileTree.css";

export interface NoteTreeNode {
  key: string;
  title: string;
  isLeaf?: boolean;
  children?: NoteTreeNode[];
}

interface NoteFileTreeProps {
  onSelectFile: (fileId: string, fileName: string) => void;
  selectedFileId?: string;
}

interface ContextMenu {
  x: number;
  y: number;
  node: NoteTreeNode | null;
}

const NoteFileTree: React.FC<NoteFileTreeProps> = ({
  onSelectFile,
  selectedFileId,
}) => {
  const [treeData, setTreeData] = useState<NoteTreeNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<NoteTreeNode | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef<boolean>(false);
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clickCountRef = useRef<number>(0);

  // 显示提示消息
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 加载文件树数据
  const loadTree = async () => {
    try {
      const tree = await window.electron.ipcRenderer.invoke(
        VS_GO_EVENT.USER_NOTES_GET_TREE
      );
      setTreeData(tree || []);
    } catch (error) {
      console.error("加载文件树失败:", error);
      showToast("加载文件树失败", "error");
    }
  };

  useEffect(() => {
    loadTree();
  }, []);

  useEffect(() => {
    if (selectedFileId) {
      setSelectedKey(selectedFileId);
    }
  }, [selectedFileId]);

  useEffect(() => {
    if (editingKey && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingKey]);

  // 关闭右键菜单
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  // 查找节点
  const findNode = (nodes: NoteTreeNode[], key: string): NoteTreeNode | null => {
    for (const node of nodes) {
      if (node.key === key) return node;
      if (node.children) {
        const found = findNode(node.children, key);
        if (found) return found;
      }
    }
    return null;
  };

  // 切换展开/折叠
  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // 处理节点点击
  const handleNodeClick = (node: NoteTreeNode, event: React.MouseEvent) => {
    event.stopPropagation();
    
    clickCountRef.current++;
    
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }

    // VSCode 风格：单击选中，再次单击已选中的项开始重命名
    if (clickCountRef.current === 1) {
      clickTimeoutRef.current = setTimeout(() => {
        if (selectedKey === node.key && !editingKey) {
          // 已选中的项，再次单击开始重命名
          handleStartRename(node);
        } else {
          // 选中节点
          setSelectedKey(node.key);
          if (node.isLeaf) {
            onSelectFile(node.key, node.title);
          }
        }
        clickCountRef.current = 0;
      }, 300);
    } else if (clickCountRef.current === 2) {
      // 双击
      clickCountRef.current = 0;
      if (!node.isLeaf) {
        toggleExpand(node.key);
      }
    }
  };

  // 处理箭头点击
  const handleArrowClick = (node: NoteTreeNode, event: React.MouseEvent) => {
    event.stopPropagation();
    toggleExpand(node.key);
  };

  // 处理右键菜单
  const handleContextMenu = (node: NoteTreeNode | null, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      node,
    });
  };

  // 创建新文件
  const handleCreateFile = async (parentId?: string) => {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        VS_GO_EVENT.USER_NOTES_CREATE_FILE,
        "新建笔记",
        parentId
      );
      if (result.success) {
        await loadTree();
        if (parentId) {
          setExpandedKeys((prev) => new Set(prev).add(parentId));
        }
        setEditingKey(result.node.key);
        setEditingValue(result.node.title.replace(".md", ""));
      }
    } catch (error) {
      showToast("创建文件失败", "error");
    }
    setContextMenu(null);
  };

  // 创建新文件夹
  const handleCreateFolder = async (parentId?: string) => {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        VS_GO_EVENT.USER_NOTES_CREATE_FOLDER,
        "新建文件夹",
        parentId
      );
      if (result.success) {
        await loadTree();
        if (parentId) {
          setExpandedKeys((prev) => new Set(prev).add(parentId));
        }
        setEditingKey(result.node.key);
        setEditingValue(result.node.title);
      }
    } catch (error) {
      showToast("创建文件夹失败", "error");
    }
    setContextMenu(null);
  };

  // 开始重命名
  const handleStartRename = (node: NoteTreeNode) => {
    setEditingKey(node.key);
    setEditingValue(node.isLeaf ? node.title.replace(".md", "") : node.title);
    setContextMenu(null);
  };

  // 完成重命名
  const handleFinishRename = async () => {
    if (!editingKey || !editingValue.trim()) {
      setEditingKey(null);
      return;
    }

    try {
      const result = await window.electron.ipcRenderer.invoke(
        VS_GO_EVENT.USER_NOTES_RENAME_NODE,
        editingKey,
        editingValue.trim()
      );
      if (result.success) {
        await loadTree();
        showToast("重命名成功");
      } else {
        showToast("重命名失败", "error");
      }
    } catch (error) {
      showToast("重命名失败", "error");
    } finally {
      setEditingKey(null);
    }
  };

  // 取消重命名
  const handleCancelRename = () => {
    setEditingKey(null);
    setEditingValue("");
  };

  // 删除节点
  const handleDeleteNode = async (node: NoteTreeNode) => {
    setContextMenu(null);
    setConfirmDelete(node);
  };

  const confirmDeleteNode = async () => {
    if (!confirmDelete) return;

    try {
      const result = await window.electron.ipcRenderer.invoke(
        VS_GO_EVENT.USER_NOTES_DELETE_NODE,
        confirmDelete.key
      );
      if (result.success) {
        await loadTree();
        showToast("删除成功");
        if (selectedKey === confirmDelete.key) {
          setSelectedKey(null);
        }
      } else {
        showToast("删除失败", "error");
      }
    } catch (error) {
      showToast("删除失败", "error");
    } finally {
      setConfirmDelete(null);
    }
  };

  // 渲染树节点
  const renderTreeNode = (node: NoteTreeNode, level: number = 0): React.ReactNode => {
    const isExpanded = expandedKeys.has(node.key);
    const isSelected = selectedKey === node.key;
    const isEditing = editingKey === node.key;
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.key} className="tree-node-wrapper">
        <div
          className={`tree-node ${isSelected ? "selected" : ""} ${isEditing ? "editing" : ""}`}
          style={{ paddingLeft: `${level * 12 + 4}px` }}
          onClick={(e) => handleNodeClick(node, e)}
          onContextMenu={(e) => handleContextMenu(node, e)}
        >
          {/* 展开/折叠箭头 */}
          {!node.isLeaf ? (
            <span
              className={`tree-node-arrow ${isExpanded ? "expanded" : ""}`}
              onClick={(e) => handleArrowClick(node, e)}
            >
              ▶
            </span>
          ) : (
            <span className="tree-node-arrow-placeholder" />
          )}

          {/* 图标 */}
          <span className="tree-node-icon">
            {node.isLeaf ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M9.5 1H3.5L3 1.5v13l.5.5h9l.5-.5v-10L9.5 1zM12 14H4V2h5v3.5l.5.5H12v8z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                {isExpanded ? (
                  <path d="M1.5 2h13l.5.5v10l-.5.5h-13l-.5-.5v-10L1.5 2zm.5 1v9h12V3H2z M1 7h14v1H1z" />
                ) : (
                  <path d="M6 3H1.5l-.5.5v9l.5.5H7V4L6 3zm0 9H2V4h4v8zm7-9H8v9h6l.5-.5v-7L13 3h-1V2h1l1 1v7h-1V3z" />
                )}
              </svg>
            )}
          </span>

          {/* 标题或输入框 */}
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              className="tree-node-input"
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onBlur={() => {
                if (!isComposingRef.current) {
                  handleFinishRename();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isComposingRef.current) {
                  handleFinishRename();
                } else if (e.key === "Escape" && !isComposingRef.current) {
                  handleCancelRename();
                }
              }}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                isComposingRef.current = false;
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="tree-node-title">{node.title}</span>
          )}
        </div>

        {/* 子节点 */}
        {!node.isLeaf && isExpanded && hasChildren && (
          <div className="tree-node-children">
            {node.children!.map((child) => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // 渲染右键菜单
  const renderContextMenu = () => {
    if (!contextMenu) return null;

    const { x, y, node } = contextMenu;
    const isFolder = node && !node.isLeaf;

    return (
      <div
        className="context-menu"
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
      >
        {isFolder && (
          <>
            <div className="context-menu-item" onClick={() => handleCreateFile(node.key)}>
              <span className="context-menu-icon">📄</span>
              新建文件
            </div>
            <div className="context-menu-item" onClick={() => handleCreateFolder(node.key)}>
              <span className="context-menu-icon">📁</span>
              新建文件夹
            </div>
            <div className="context-menu-divider" />
          </>
        )}
        {!isFolder && !node && (
          <>
            <div className="context-menu-item" onClick={() => handleCreateFile()}>
              <span className="context-menu-icon">📄</span>
              新建文件
            </div>
            <div className="context-menu-item" onClick={() => handleCreateFolder()}>
              <span className="context-menu-icon">📁</span>
              新建文件夹
            </div>
          </>
        )}
        {node && (
          <>
            <div className="context-menu-item" onClick={() => handleStartRename(node)}>
              <span className="context-menu-icon">✏️</span>
              重命名
            </div>
            <div className="context-menu-divider" />
            <div className="context-menu-item danger" onClick={() => handleDeleteNode(node)}>
              <span className="context-menu-icon">🗑️</span>
              删除
            </div>
          </>
        )}
      </div>
    );
  };

  // 渲染确认删除对话框
  const renderConfirmDialog = () => {
    if (!confirmDelete) return null;

    return (
      <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">确认删除</div>
          <div className="modal-body">
            确定要删除 "{confirmDelete.title}" 吗？
            {!confirmDelete.isLeaf && <div className="modal-warning">文件夹内的所有内容也会被删除。</div>}
          </div>
          <div className="modal-footer">
            <button className="modal-btn" onClick={() => setConfirmDelete(null)}>
              取消
            </button>
            <button className="modal-btn danger" onClick={confirmDeleteNode}>
              删除
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 渲染提示消息
  const renderToast = () => {
    if (!toast) return null;

    return (
      <div className={`toast ${toast.type}`}>
        {toast.message}
      </div>
    );
  };

  return (
    <div className="note-file-tree">
      {/* 工具栏 */}
      <div className="tree-toolbar">
        <span className="tree-title">笔记</span>
        <div className="tree-actions">
          <button
            className="tree-action-btn"
            onClick={() => handleCreateFile()}
            title="新建文件"
          >
            <FileAddOutlined />
          </button>
          <button
            className="tree-action-btn"
            onClick={() => handleCreateFolder()}
            title="新建文件夹"
          >
            <FolderAddOutlined />
          </button>
        </div>
      </div>

      {/* 文件树 */}
      <div
        ref={treeContainerRef}
        className="tree-container"
        onContextMenu={(e) => handleContextMenu(null, e)}
      >
        {treeData.length > 0 ? (
          <>
            {treeData.map((node) => renderTreeNode(node, 0))}
          </>
        ) : (
          <div className="tree-empty">
            <p>暂无笔记</p>
            <p className="tree-empty-hint">点击上方按钮创建第一个笔记</p>
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      {renderContextMenu()}

      {/* 确认删除对话框 */}
      {renderConfirmDialog()}

      {/* 提示消息 */}
      {renderToast()}
    </div>
  );
};

export default NoteFileTree;
