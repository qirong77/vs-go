import React, { useState, useRef, useEffect } from "react";
import { 
  FileAddOutlined, 
  FolderAddOutlined, 
  FileOutlined, 
  FolderOutlined, 
  FolderOpenOutlined,
  EditOutlined,
  DeleteOutlined 
} from "@ant-design/icons";
import { Tree, Modal, message, Dropdown, Input } from "antd";
import type { MenuProps, TreeProps } from "antd";
import type { DataNode } from "antd/es/tree";
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

// 将 NoteTreeNode 转换为 antd DataNode
const convertToDataNode = (nodes: NoteTreeNode[]): DataNode[] => {
  return nodes.map((node) => ({
    key: node.key,
    title: node.title,
    isLeaf: node.isLeaf,
    children: node.children ? convertToDataNode(node.children) : undefined,
    icon: node.isLeaf ? (
      <FileOutlined />
    ) : (
      (props: any) =>
        props.expanded ? <FolderOpenOutlined /> : <FolderOutlined />
    ),
  }));
};

const NoteFileTree: React.FC<NoteFileTreeProps> = ({
  onSelectFile,
  selectedFileId,
}) => {
  const [treeData, setTreeData] = useState<NoteTreeNode[]>([]);
  const [dataNodes, setDataNodes] = useState<DataNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const inputRef = useRef<any>(null);

  // 加载文件树数据
  const loadTree = async () => {
    try {
      const tree = await window.electron.ipcRenderer.invoke(
        VS_GO_EVENT.USER_NOTES_GET_TREE
      );
      setTreeData(tree || []);
      setDataNodes(convertToDataNode(tree || []));
    } catch (error) {
      console.error("加载文件树失败:", error);
      messageApi.error("加载文件树失败");
    }
  };

  useEffect(() => {
    loadTree();
  }, []);

  useEffect(() => {
    if (selectedFileId) {
      setSelectedKeys([selectedFileId]);
    }
  }, [selectedFileId]);

  useEffect(() => {
    if (editingKey && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingKey]);

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

  // 树节点选择事件
  const onSelect: TreeProps['onSelect'] = (selectedKeys) => {
    if (selectedKeys.length > 0) {
      const key = selectedKeys[0] as string;
      setSelectedKeys([key]);
      const node = findNode(treeData, key);
      if (node && node.isLeaf) {
        onSelectFile(node.key, node.title);
      }
    }
  };

  // 树节点展开事件
  const onExpand: TreeProps['onExpand'] = (expandedKeys) => {
    setExpandedKeys(expandedKeys);
  };

  // 拖拽事件处理
  const onDrop: TreeProps['onDrop'] = async (info) => {
    const dropKey = info.node.key;
    const dragKey = info.dragNode.key;

    // 找到拖拽节点和目标节点
    const dragNode = findNode(treeData, dragKey as string);
    const dropNode = findNode(treeData, dropKey as string);

    if (!dragNode) return;

    try {
      // 判断是拖拽到文件夹内还是调整排序
      if (info.dropToGap) {
        // 拖拽到节点之间，调整排序
        messageApi.info('排序功能需要后端支持，暂未实现');
      } else {
        // 拖拽到文件夹内
        if (dropNode && !dropNode.isLeaf) {
          // 这里调用后端接口移动节点
          // await window.electron.ipcRenderer.invoke(
          //   VS_GO_EVENT.USER_NOTES_MOVE_NODE,
          //   dragKey,
          //   dropKey
          // );
          messageApi.info('移动功能需要后端支持，暂未实现');
          // await loadTree();
        }
      }
    } catch (error) {
      messageApi.error('操作失败');
    }
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
          setExpandedKeys((prev) => [...prev, parentId]);
        }
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
          setExpandedKeys((prev) => [...prev, parentId]);
        }
        setEditingKey(result.node.key);
        setEditingValue(result.node.title);
      }
    } catch (error) {
      messageApi.error("创建文件夹失败");
    }
  };

  // 重命名节点
  const handleStartRename = (node: NoteTreeNode) => {
    setEditingKey(node.key);
    setEditingValue(node.isLeaf ? node.title.replace(".md", "") : node.title);
  };

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
        messageApi.success("重命名成功");
      } else {
        messageApi.error("重命名失败");
      }
    } catch (error) {
      messageApi.error("重命名失败");
    } finally {
      setEditingKey(null);
    }
  };

  const handleCancelRename = () => {
    setEditingKey(null);
    setEditingValue("");
  };

  // 删除节点
  const handleDeleteNode = (node: NoteTreeNode) => {
    const isFolder = !node.isLeaf;
    
    modal.confirm({
      title: "确认删除",
      content: (
        <div>
          <p>确定要删除 "{node.title}" 吗？</p>
          {isFolder && (
            <div style={{
              marginTop: 8,
              padding: 8,
              background: 'rgba(252, 175, 62, 0.2)',
              borderLeft: '3px solid #fcaf3e',
              fontSize: 12,
              borderRadius: 2
            }}>
              文件夹内的所有内容也会被删除。
            </div>
          )}
        </div>
      ),
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
            if (selectedKeys[0] === node.key) {
              setSelectedKeys([]);
            }
          } else {
            messageApi.error("删除失败");
          }
        } catch (error) {
          messageApi.error("删除失败");
        }
      },
    });
  };

  // 右键菜单配置
  const getContextMenuItems = (node: NoteTreeNode | null): MenuProps['items'] => {
    const isFolder = node && !node.isLeaf;

    if (!node) {
      // 空白区域右键菜单
      return [
        {
          key: 'newFile',
          label: '新建文件',
          icon: <FileOutlined />,
          onClick: () => handleCreateFile(),
        },
        {
          key: 'newFolder',
          label: '新建文件夹',
          icon: <FolderOutlined />,
          onClick: () => handleCreateFolder(),
        },
      ];
    }

    const items: MenuProps['items'] = [];

    if (isFolder) {
      items.push(
        {
          key: 'newFile',
          label: '新建文件',
          icon: <FileOutlined />,
          onClick: () => handleCreateFile(node.key),
        },
        {
          key: 'newFolder',
          label: '新建文件夹',
          icon: <FolderOutlined />,
          onClick: () => handleCreateFolder(node.key),
        },
        { type: 'divider' }
      );
    }

    items.push(
      {
        key: 'rename',
        label: '重命名',
        icon: <EditOutlined />,
        onClick: () => handleStartRename(node),
      },
      { type: 'divider' },
      {
        key: 'delete',
        label: '删除',
        icon: <DeleteOutlined />,
        danger: true,
        onClick: () => handleDeleteNode(node),
      }
    );

    return items;
  };

  // 自定义树节点渲染（支持重命名）
  const titleRender = (nodeData: DataNode): React.ReactNode => {
    const node = findNode(treeData, nodeData.key as string);
    if (!node) return nodeData.title as React.ReactNode;

    if (editingKey === node.key) {
      return (
        <Input
          ref={inputRef}
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onBlur={handleFinishRename}
          onPressEnter={handleFinishRename}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              handleCancelRename();
            }
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          size="small"
          style={{ width: '100%' }}
        />
      );
    }

    return (
      <Dropdown
        menu={{ items: getContextMenuItems(node) }}
        trigger={['contextMenu']}
      >
        <span 
          style={{ userSelect: 'none', display: 'inline-block', width: '100%' }}
          onContextMenu={(e) => e.stopPropagation()}
        >
          {nodeData.title as React.ReactNode}
        </span>
      </Dropdown>
    );
  };

  return (
    <div className="note-file-tree">
      {contextHolder}
      {modalContextHolder}
      
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
      <div className="tree-container">
        {dataNodes.length > 0 ? (
          <Dropdown
            menu={{ items: getContextMenuItems(null) }}
            trigger={['contextMenu']}
          >
            <div style={{ height: '100%' }}>
              <Tree
                treeData={dataNodes}
                selectedKeys={selectedKeys}
                expandedKeys={expandedKeys}
                onSelect={onSelect}
                onExpand={onExpand}
                onDrop={onDrop}
                draggable
                blockNode
                showIcon
                titleRender={titleRender}
              />
            </div>
          </Dropdown>
        ) : (
          <div className="tree-empty">
            <p>暂无笔记</p>
            <p className="tree-empty-hint">点击上方按钮创建第一个笔记</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NoteFileTree;

