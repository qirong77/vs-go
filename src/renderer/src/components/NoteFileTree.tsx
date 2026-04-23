import React, { useState, useRef, useEffect } from "react";
import {
  FileAddOutlined,
  FolderAddOutlined,
  FileOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { Tree, Modal, message, Dropdown, Input } from "antd";
import type { MenuProps, TreeProps } from "antd";
import type { DataNode } from "antd/es/tree";
import { VS_GO_EVENT } from "../../../common/EVENT";
import type { NoteTreeNode } from "../../../common/type";
import "./NoteFileTree.css";

// 仅保存排序结构（key 层级），不保存完整节点信息
interface OrderNode {
  key: string;
  children?: OrderNode[];
}

const ORDER_STORAGE_KEY = "vs-go-notes-tree-order";

// 从树中提取排序结构
const extractOrder = (nodes: NoteTreeNode[]): OrderNode[] =>
  nodes.map((n) => ({
    key: n.key,
    children: n.children?.length ? extractOrder(n.children) : undefined,
  }));

// 将后端树数据按保存的排序结构重新排列
const applyOrderToTree = (
  backendNodes: NoteTreeNode[],
  orderNodes: OrderNode[]
): NoteTreeNode[] => {
  // 建立 key -> node 的完整映射（扁平化）
  const nodeMap = new Map<string, NoteTreeNode>();
  const collect = (nodes: NoteTreeNode[]) => {
    nodes.forEach((n) => {
      nodeMap.set(n.key, n);
      if (n.children) collect(n.children);
    });
  };
  collect(backendNodes);

  const usedKeys = new Set<string>();

  const buildOrdered = (orders: OrderNode[]): NoteTreeNode[] => {
    const result: NoteTreeNode[] = [];
    for (const o of orders) {
      const node = nodeMap.get(o.key);
      if (!node) continue;
      usedKeys.add(o.key);
      result.push(
        o.children && node.children ? { ...node, children: buildOrdered(o.children) } : node
      );
    }
    return result;
  };

  // 找出不在排序结构中的新增节点（追加到根或对应父节点末尾）
  const appendUnused = (nodes: NoteTreeNode[]): NoteTreeNode[] => {
    return nodes
      .filter((n) => !usedKeys.has(n.key))
      .map((n) => ({
        ...n,
        children: n.children ? appendUnused(n.children) : undefined,
      }));
  };

  const ordered = buildOrdered(orderNodes);
  const unused = appendUnused(backendNodes);
  return [...ordered, ...unused];
};

// 从树中移除节点，返回 [新树, 被移除节点]
const removeFromTree = (
  nodes: NoteTreeNode[],
  key: string
): [NoteTreeNode[], NoteTreeNode | null] => {
  let removed: NoteTreeNode | null = null;
  const result = nodes
    .filter((n) => {
      if (n.key === key) {
        removed = n;
        return false;
      }
      return true;
    })
    .map((n) => {
      if (n.children) {
        const [newChildren, found] = removeFromTree(n.children, key);
        if (found) {
          removed = found;
          return { ...n, children: newChildren };
        }
      }
      return n;
    });
  return [result, removed];
};

// 将节点插入树中指定位置
const insertIntoTree = (
  nodes: NoteTreeNode[],
  targetKey: string,
  node: NoteTreeNode,
  dropPosition: number // -1: 目标之前; 1: 目标之后; 0: 目标内部
): NoteTreeNode[] => {
  const result: NoteTreeNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const cur = nodes[i];
    if (cur.key === targetKey) {
      if (dropPosition < 0) {
        result.push(node, cur);
      } else if (dropPosition > 0) {
        result.push(cur, node);
      } else {
        // 插入文件夹内部（末尾）
        const children = cur.children ? [...cur.children, node] : [node];
        result.push({ ...cur, children });
      }
    } else {
      if (cur.children) {
        result.push({
          ...cur,
          children: insertIntoTree(cur.children, targetKey, node, dropPosition),
        });
      } else {
        result.push(cur);
      }
    }
  }
  return result;
};

const saveOrder = (nodes: NoteTreeNode[]) => {
  try {
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(extractOrder(nodes)));
  } catch (_) {}
};

const loadOrder = (): OrderNode[] | null => {
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
};

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
      (props: any) => (props.expanded ? <FolderOpenOutlined /> : <FolderOutlined />)
    ),
  }));
};

const NoteFileTree: React.FC<NoteFileTreeProps> = ({ onSelectFile, selectedFileId }) => {
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
      const tree: NoteTreeNode[] = await window.electron.ipcRenderer.invoke(
        VS_GO_EVENT.USER_NOTES_GET_TREE
      );
      const rawTree = tree || [];
      // 应用本地保存的排序顺序
      const savedOrder = loadOrder();
      const orderedTree = savedOrder ? applyOrderToTree(rawTree, savedOrder) : rawTree;
      setTreeData(orderedTree);
      setDataNodes(convertToDataNode(orderedTree));
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
  const onSelect: TreeProps["onSelect"] = (selectedKeys) => {
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
  const onExpand: TreeProps["onExpand"] = (expandedKeys) => {
    setExpandedKeys(expandedKeys);
  };

  // 拖拽事件处理
  const onDrop: TreeProps["onDrop"] = (info) => {
    const dropKey = info.node.key as string;
    const dragKey = info.dragNode.key as string;

    if (dragKey === dropKey) return;

    // 计算相对插入位置
    const dropPos = info.node.pos.split("-");
    const relativePosition = info.dropPosition - Number(dropPos[dropPos.length - 1]);

    // 先从树中移除拖拽节点
    const [treeWithoutDrag, dragNode] = removeFromTree(treeData, dragKey);
    if (!dragNode) return;

    let newTree: NoteTreeNode[];

    if (info.dropToGap) {
      // 拖拽到节点间隙，调整排序（relativePosition: -1 前, 1 后）
      newTree = insertIntoTree(treeWithoutDrag, dropKey, dragNode, relativePosition);
    } else {
      // 拖拽到节点上：仅允许拖入文件夹
      const dropNode = findNode(treeWithoutDrag, dropKey);
      if (!dropNode || dropNode.isLeaf) return;
      newTree = insertIntoTree(treeWithoutDrag, dropKey, dragNode, 0);
    }

    setTreeData(newTree);
    setDataNodes(convertToDataNode(newTree));
    saveOrder(newTree);
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
            <div
              style={{
                marginTop: 8,
                padding: 8,
                background: "rgba(252, 175, 62, 0.2)",
                borderLeft: "3px solid #fcaf3e",
                fontSize: 12,
                borderRadius: 2,
              }}
            >
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
  const getContextMenuItems = (node: NoteTreeNode | null): MenuProps["items"] => {
    const isFolder = node && !node.isLeaf;
    if (!node) {
      // 空白区域右键菜单
      return [
        {
          key: "newFile",
          label: "新建文件",
          icon: <FileOutlined />,
          onClick: () => handleCreateFile(),
        },
        {
          key: "newFolder",
          label: "新建文件夹",
          icon: <FolderOutlined />,
          onClick: () => handleCreateFolder(),
        },
      ];
    }

    const items: MenuProps["items"] = [];

    if (isFolder) {
      items.push(
        {
          key: "newFile",
          label: "新建文件",
          icon: <FileOutlined />,
          onClick: () => handleCreateFile(node.key),
        },
        {
          key: "newFolder",
          label: "新建文件夹",
          icon: <FolderOutlined />,
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
      { type: "divider" },
      {
        key: "delete",
        label: "删除",
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
            if (e.key === "Escape") {
              handleCancelRename();
            }
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          size="small"
          style={{ width: "100%" }}
        />
      );
    }

    return (
      <Dropdown menu={{ items: getContextMenuItems(node) }} trigger={["contextMenu"]}>
        <span
          style={{ userSelect: "none", display: "inline-block", width: "100%" }}
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
          <button className="tree-action-btn" onClick={() => handleCreateFile()} title="新建文件">
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
          <Dropdown menu={{ items: getContextMenuItems(null) }} trigger={["contextMenu"]}>
            <div style={{ height: "100%" }}>
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
