import React, { useState, useRef, useEffect } from "react";
import { Tree, Input, Dropdown, Modal, message } from "antd";
import type { TreeDataNode, TreeProps } from "antd";
import type { MenuProps } from "antd";
import {
  FileOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  DeleteOutlined,
  EditOutlined,
  FileAddOutlined,
  FolderAddOutlined,
} from "@ant-design/icons";
import { VS_GO_EVENT } from "../../../common/EVENT";

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

const NoteFileTree: React.FC<NoteFileTreeProps> = ({
  onSelectFile,
  selectedFileId,
}) => {
  const [treeData, setTreeData] = useState<NoteTreeNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const inputRef = useRef<any>(null);
  const [messageApi, contextHolder] = message.useMessage();

  // 加载文件树数据
  const loadTree = async () => {
    try {
      const tree = await window.electron.ipcRenderer.invoke(
        VS_GO_EVENT.USER_NOTES_GET_TREE
      );
      setTreeData(tree || []);
    } catch (error) {
      console.error("加载文件树失败:", error);
    }
  };

  useEffect(() => {
    loadTree();
  }, []);

  useEffect(() => {
    if (editingKey && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingKey]);

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
          setExpandedKeys((prev) =>
            prev.includes(parentId) ? prev : [...prev, parentId]
          );
        }
        // 进入编辑状态
        setEditingKey(result.node.key);
        setEditingValue(result.node.title.replace(".md", ""));
      }
    } catch (error) {
      messageApi.error("创建文件失败");
    }
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
          setExpandedKeys((prev) =>
            prev.includes(parentId) ? prev : [...prev, parentId]
          );
        }
        // 进入编辑状态
        setEditingKey(result.node.key);
        setEditingValue(result.node.title);
      }
    } catch (error) {
      messageApi.error("创建文件夹失败");
    }
  };

  // 删除节点
  const handleDelete = async (node: NoteTreeNode) => {
    Modal.confirm({
      title: "确认删除",
      content: `确定要删除 "${node.title}" 吗？${!node.isLeaf ? "文件夹内的所有内容也会被删除。" : ""}`,
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const result = await window.electron.ipcRenderer.invoke(
            VS_GO_EVENT.USER_NOTES_DELETE_NODE,
            node.key
          );
          if (result.success) {
            await loadTree();
            messageApi.success("删除成功");
          }
        } catch (error) {
          messageApi.error("删除失败");
        }
      },
    });
  };

  // 开始重命名
  const handleStartRename = (node: NoteTreeNode) => {
    setEditingKey(node.key);
    setEditingValue(node.isLeaf ? node.title.replace(".md", "") : node.title);
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
      }
    } catch (error) {
      messageApi.error("重命名失败");
    } finally {
      setEditingKey(null);
    }
  };

  // 右键菜单项
  const getContextMenuItems = (node: NoteTreeNode | null): MenuProps["items"] => {
    if (!node) {
      // 空白区域的右键菜单
      return [
        {
          key: "newFile",
          label: "新建文件",
          icon: <FileAddOutlined />,
          onClick: () => handleCreateFile(),
        },
        {
          key: "newFolder",
          label: "新建文件夹",
          icon: <FolderAddOutlined />,
          onClick: () => handleCreateFolder(),
        },
      ];
    }

    const items: MenuProps["items"] = [];

    if (!node.isLeaf) {
      // 文件夹的右键菜单
      items.push(
        {
          key: "newFile",
          label: "新建文件",
          icon: <FileAddOutlined />,
          onClick: () => handleCreateFile(node.key),
        },
        {
          key: "newFolder",
          label: "新建文件夹",
          icon: <FolderAddOutlined />,
          onClick: () => handleCreateFolder(node.key),
        },
        { type: "divider" }
      );
    }

    items.push(
      {
        key: "rename",
        label: "重命名",
        icon: <EditOutlined />,
        onClick: () => handleStartRename(node),
      },
      {
        key: "delete",
        label: "删除",
        icon: <DeleteOutlined />,
        danger: true,
        onClick: () => handleDelete(node),
      }
    );

    return items;
  };

  // 转换树数据以适配 antd Tree
  const convertToAntdTreeData = (nodes: NoteTreeNode[]): TreeDataNode[] => {
    return nodes.map((node) => {
      const isEditing = editingKey === node.key;

      return {
        key: node.key,
        title: isEditing ? (
          <Input
            ref={inputRef}
            size="small"
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={handleFinishRename}
            onPressEnter={handleFinishRename}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditingKey(null);
              }
            }}
            style={{ width: 120, height: 22 }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <Dropdown
            menu={{ items: getContextMenuItems(node) }}
            trigger={["contextMenu"]}
          >
            <span
              className="tree-node-title"
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleStartRename(node);
              }}
            >
              {node.title}
            </span>
          </Dropdown>
        ),
        icon: node.isLeaf ? (
          <FileOutlined />
        ) : expandedKeys.includes(node.key) ? (
          <FolderOpenOutlined />
        ) : (
          <FolderOutlined />
        ),
        isLeaf: node.isLeaf,
        children: node.children
          ? convertToAntdTreeData(node.children)
          : undefined,
      };
    });
  };

  // 选择节点
  const handleSelect: TreeProps["onSelect"] = (selectedKeys, info) => {
    const node = info.node as TreeDataNode & { isLeaf?: boolean };
    if (node.isLeaf && selectedKeys.length > 0) {
      const fileNode = findNode(treeData, selectedKeys[0] as string);
      if (fileNode) {
        onSelectFile(fileNode.key, fileNode.title);
      }
    }
  };

  // 在原始数据中查找节点
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

  // 展开/折叠
  const handleExpand: TreeProps["onExpand"] = (expandedKeysValue) => {
    setExpandedKeys(expandedKeysValue);
  };

  return (
    <div className="note-file-tree">
      {contextHolder}
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
      <Dropdown
        menu={{ items: getContextMenuItems(null) }}
        trigger={["contextMenu"]}
      >
        <div className="tree-container">
          {treeData.length > 0 ? (
            <Tree
              showIcon
              blockNode
              treeData={convertToAntdTreeData(treeData)}
              selectedKeys={selectedFileId ? [selectedFileId] : []}
              expandedKeys={expandedKeys}
              onSelect={handleSelect}
              onExpand={handleExpand}
            />
          ) : (
            <div className="tree-empty">
              <p>暂无笔记</p>
              <p className="tree-empty-hint">
                点击上方按钮创建第一个笔记
              </p>
            </div>
          )}
        </div>
      </Dropdown>
    </div>
  );
};

export default NoteFileTree;
