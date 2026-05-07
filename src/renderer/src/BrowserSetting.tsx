import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOutlined, HistoryOutlined, LinkOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  ConfigProvider,
  Empty,
  Input,
  Layout,
  Select,
  Space,
  Spin,
  Tree,
  Typography,
  theme,
} from "antd";
import type { TreeProps } from "antd";
import { VS_GO_EVENT } from "../../common/EVENT";
import { generateId } from "../../common/utils";
import type { BrowserItem } from "../../common/type";
import {
  browserItemsToAntdTreeData,
  moveParentTargets,
} from "./bookmark/bookmarkUtils";

const { ipcRenderer } = window.electron;
const { Sider, Content } = Layout;
const { Title, Text } = Typography;

function filterItemsBySearch(items: BrowserItem[], q: string): BrowserItem[] {
  const term = q.trim().toLowerCase();
  if (!term) return items;
  const byId = new Map(items.map((i) => [i.id, i]));
  const keep = new Set<string>();
  for (const it of items) {
    const u = (it.url ?? "").toLowerCase();
    if (it.name.toLowerCase().includes(term) || u.includes(term)) {
      let cur: string | null = it.id;
      while (cur) {
        keep.add(cur);
        const p = byId.get(cur)?.parentId ?? null;
        cur = p;
      }
    }
  }
  return items.filter((i) => keep.has(i.id));
}

function parentFolderName(all: BrowserItem[], parentId: string | null | undefined): string {
  if (parentId == null) return "书签栏";
  return all.find((i) => i.id === parentId)?.name ?? "（未知）";
}

function BrowserSettingInner(): React.JSX.Element {
  const { message } = App.useApp();
  const [list, setList] = useState<BrowserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [newBookmarkName, setNewBookmarkName] = useState("");
  const [newBookmarkUrl, setNewBookmarkUrl] = useState("");
  const [newFolderName, setNewFolderName] = useState("");

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_LIST)) as BrowserItem[] | null;
      setList(Array.isArray(res) ? res : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const filteredList = useMemo(() => filterItemsBySearch(list, search), [list, search]);
  const treeData = useMemo(() => browserItemsToAntdTreeData(filteredList), [filteredList]);

  const selectedId = selectedKeys[0] ?? null;
  const selectedItem = useMemo(
    () => (selectedId ? list.find((i) => i.id === selectedId) : undefined),
    [list, selectedId]
  );

  useEffect(() => {
    if (!selectedItem) {
      setEditName("");
      setEditUrl("");
      return;
    }
    setEditName(selectedItem.name);
    setEditUrl(selectedItem.url ?? "");
  }, [selectedItem]);

  const onTreeSelect: TreeProps["onSelect"] = (keys) => {
    setSelectedKeys(keys.map(String));
    setNewBookmarkName("");
    setNewBookmarkUrl("");
    setNewFolderName("");
  };

  const handleSaveItem = async (): Promise<void> => {
    if (!selectedItem) return;
    const name = editName.trim();
    if (!name) {
      message.warning("名称不能为空");
      return;
    }
    if (selectedItem.type === "bookmark" || selectedItem.type === "history") {
      const url = editUrl.trim();
      if (!url) {
        message.warning("URL 不能为空");
        return;
      }
      await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_UPDATE, {
        ...selectedItem,
        name,
        url,
      } satisfies BrowserItem);
    } else {
      await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_UPDATE, {
        ...selectedItem,
        name,
      } satisfies BrowserItem);
    }
    message.success("已保存");
    await fetchList();
  };

  const handleRemove = async (id: string): Promise<void> => {
    await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_REMOVE, id);
    message.success("已删除");
    setSelectedKeys([]);
    await fetchList();
  };

  const handleRemoveAll = async (): Promise<void> => {
    await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_REMOVE_ALL);
    message.success("已清空");
    setSelectedKeys([]);
    await fetchList();
  };

  const handleMoveTo = async (parentId: string | null): Promise<void> => {
    if (!selectedItem) return;
    await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_UPDATE, {
      ...selectedItem,
      parentId,
    } satisfies BrowserItem);
    message.success("已移动");
    await fetchList();
  };

  const handleAddRootBookmark = async (): Promise<void> => {
    const name = newBookmarkName.trim();
    const url = newBookmarkUrl.trim();
    if (!name || !url) {
      message.warning("请填写书签名称与 URL");
      return;
    }
    await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_ADD, {
      id: generateId(),
      name,
      url,
      type: "bookmark",
      parentId: null,
    } satisfies BrowserItem);
    message.success("已添加到书签栏");
    setNewBookmarkName("");
    setNewBookmarkUrl("");
    await fetchList();
  };

  const handleAddRootFolder = async (): Promise<void> => {
    const name = newFolderName.trim();
    if (!name) {
      message.warning("请填写文件夹名称");
      return;
    }
    await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_ADD, {
      id: generateId(),
      name,
      type: "folder",
      parentId: null,
    } satisfies BrowserItem);
    message.success("已创建文件夹");
    setNewFolderName("");
    await fetchList();
  };

  const handleAddChildBookmark = async (parentId: string): Promise<void> => {
    const name = newBookmarkName.trim();
    const url = newBookmarkUrl.trim();
    if (!name || !url) {
      message.warning("请填写书签名称与 URL");
      return;
    }
    await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_ADD, {
      id: generateId(),
      name,
      url,
      type: "bookmark",
      parentId,
    } satisfies BrowserItem);
    message.success("已添加书签");
    setNewBookmarkName("");
    setNewBookmarkUrl("");
    await fetchList();
  };

  const handleAddChildFolder = async (parentId: string): Promise<void> => {
    const name = newFolderName.trim();
    if (!name) {
      message.warning("请填写文件夹名称");
      return;
    }
    await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_ADD, {
      id: generateId(),
      name,
      type: "folder",
      parentId,
    } satisfies BrowserItem);
    message.success("已创建子文件夹");
    setNewFolderName("");
    await fetchList();
  };

  const moveTargets = useMemo(() => {
    if (!selectedItem) return [];
    return moveParentTargets(list, selectedItem);
  }, [list, selectedItem]);

  const titleRender: TreeProps["titleRender"] = (node) => {
    const it = filteredList.find((i) => i.id === String(node.key));
    if (it?.type === "folder") {
      return (
        <Space size={6}>
          <FolderOutlined />
          <span>{it.name}</span>
        </Space>
      );
    }
    if (it?.type === "history") {
      return (
        <Space size={6}>
          <HistoryOutlined />
          <span>{it.name}</span>
        </Space>
      );
    }
    return (
      <Space size={6}>
        <LinkOutlined />
        <span>{it?.name ?? (typeof node.title === "string" ? node.title : "")}</span>
      </Space>
    );
  };

  return (
    <Layout style={{ minHeight: "100%", background: "#fff" }}>
      <Sider
        width={320}
        theme="light"
        style={{ borderRight: "1px solid var(--ant-color-border-secondary)" }}
      >
        <div style={{ padding: 16 }}>
          <Title level={5} style={{ marginTop: 0 }}>
            书签与文件夹
          </Title>
          <Input.Search
            allowClear
            placeholder="按名称或 URL 筛选"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          <Spin spinning={loading}>
            <Tree
              blockNode
              showLine
              defaultExpandAll
              treeData={treeData}
              selectedKeys={selectedKeys}
              onSelect={onTreeSelect}
              titleRender={titleRender}
              style={{ maxHeight: "calc(100vh - 220px)", overflow: "auto" }}
            />
          </Spin>
        </div>
      </Sider>
      <Content style={{ padding: 16, overflow: "auto" }}>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Space wrap style={{ width: "100%", justifyContent: "space-between" }}>
            <Text type="secondary">
              在左侧树中按文件夹层级管理；选中节点后在右侧编辑、移动或删除。
            </Text>
            <Button danger onClick={() => void handleRemoveAll()}>
              删除所有书签
            </Button>
          </Space>

          <Card size="small" title="在书签栏根目录新建">
            <Space direction="vertical" style={{ width: "100%" }} size="small">
              <Space wrap style={{ width: "100%" }}>
                <Input
                  placeholder="新书签名称"
                  value={newBookmarkName}
                  onChange={(e) => setNewBookmarkName(e.target.value)}
                  style={{ width: 160 }}
                />
                <Input
                  placeholder="URL"
                  value={newBookmarkUrl}
                  onChange={(e) => setNewBookmarkUrl(e.target.value)}
                  style={{ minWidth: 220, flex: 1 }}
                />
                <Button type="primary" onClick={() => void handleAddRootBookmark()}>
                  添加书签
                </Button>
              </Space>
              <Space wrap>
                <Input
                  placeholder="新文件夹名称"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  style={{ width: 200 }}
                />
                <Button onClick={() => void handleAddRootFolder()}>添加文件夹</Button>
              </Space>
            </Space>
          </Card>

          {!selectedItem ? (
            <Card>
              <Empty description="在左侧选择书签、历史记录或文件夹" />
            </Card>
          ) : (
            <Card
              size="small"
              title={
                selectedItem.type === "folder"
                  ? "文件夹"
                  : selectedItem.type === "history"
                    ? "历史条目"
                    : "书签"
              }
              extra={
                <Text type="secondary">
                  位置：{parentFolderName(list, selectedItem.parentId)}
                </Text>
              }
            >
              <Space direction="vertical" style={{ width: "100%" }} size="middle">
                <div>
                  <Text type="secondary">名称</Text>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    style={{ marginTop: 6 }}
                  />
                </div>
                {(selectedItem.type === "bookmark" || selectedItem.type === "history") && (
                  <div>
                    <Text type="secondary">URL</Text>
                    <Input
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      style={{ marginTop: 6 }}
                    />
                  </div>
                )}

                <Space wrap>
                  <Button type="primary" onClick={() => void handleSaveItem()}>
                    保存修改
                  </Button>
                  <Button danger onClick={() => void handleRemove(selectedItem.id)}>
                    删除
                  </Button>
                </Space>

                <div>
                  <Text type="secondary">移动到</Text>
                  <Select
                    style={{ width: "100%", maxWidth: 360, marginTop: 6 }}
                    placeholder="选择目标位置"
                    value={
                      (selectedItem.parentId ?? null) === null ? "__root__" : selectedItem.parentId
                    }
                    options={moveTargets.map((t) => ({
                      value: t.id === null ? "__root__" : t.id,
                      label: t.name,
                    }))}
                    onChange={(v) => void handleMoveTo(v === "__root__" ? null : v)}
                  />
                </div>

                {selectedItem.type === "folder" && (
                  <Card size="small" type="inner" title="在此文件夹下新建">
                    <Space direction="vertical" style={{ width: "100%" }} size="small">
                      <Space wrap style={{ width: "100%" }}>
                        <Input
                          placeholder="新书签名称"
                          value={newBookmarkName}
                          onChange={(e) => setNewBookmarkName(e.target.value)}
                          style={{ width: 140 }}
                        />
                        <Input
                          placeholder="URL"
                          value={newBookmarkUrl}
                          onChange={(e) => setNewBookmarkUrl(e.target.value)}
                          style={{ minWidth: 180, flex: 1 }}
                        />
                        <Button
                          type="primary"
                          onClick={() => void handleAddChildBookmark(selectedItem.id)}
                        >
                          添加书签
                        </Button>
                      </Space>
                      <Space wrap>
                        <Input
                          placeholder="子文件夹名称"
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          style={{ width: 180 }}
                        />
                        <Button onClick={() => void handleAddChildFolder(selectedItem.id)}>
                          新建子文件夹
                        </Button>
                      </Space>
                    </Space>
                  </Card>
                )}
              </Space>
            </Card>
          )}
        </Space>
      </Content>
    </Layout>
  );
}

export default function BrowserSetting(): React.JSX.Element {
  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }} componentSize="middle">
      <App>
        <BrowserSettingInner />
      </App>
    </ConfigProvider>
  );
}
