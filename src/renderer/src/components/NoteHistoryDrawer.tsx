import React, { useCallback, useEffect, useState } from "react";
import { Button, Drawer, Empty, List, Modal, Spin, Typography } from "antd";
import { HistoryOutlined } from "@ant-design/icons";
import { VS_GO_EVENT } from "../../../common/EVENT";
import type { UserNoteHistoryMeta } from "../../../common/type";

type Props = {
  fileId: string;
  open: boolean;
  onClose: () => void;
  /** 将编辑器恢复为某历史版本的正文 */
  onRestore: (markdown: string) => void | Promise<void>;
};

function formatSavedAt(savedAt: number): string {
  try {
    return new Date(savedAt).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return String(savedAt);
  }
}

const NoteHistoryDrawer: React.FC<Props> = ({ fileId, open, onClose, onRestore }) => {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<UserNoteHistoryMeta[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewMeta, setPreviewMeta] = useState<UserNoteHistoryMeta | null>(null);
  const [previewText, setPreviewText] = useState("");

  const loadList = useCallback(async () => {
    if (!fileId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const list = (await window.electron.ipcRenderer.invoke(
        VS_GO_EVENT.USER_NOTES_HISTORY_LIST,
        fileId
      )) as UserNoteHistoryMeta[];
      setItems(Array.isArray(list) ? list : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    if (open) {
      void loadList();
    }
  }, [open, loadList]);

  const openPreview = async (meta: UserNoteHistoryMeta) => {
    setPreviewMeta(meta);
    setPreviewOpen(true);
    setPreviewText("");
    setPreviewLoading(true);
    try {
      const text = (await window.electron.ipcRenderer.invoke(
        VS_GO_EVENT.USER_NOTES_HISTORY_GET,
        fileId,
        meta.id
      )) as string;
      setPreviewText(text ?? "");
    } catch {
      setPreviewText("");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!previewMeta) return;
    await onRestore(previewText);
    setPreviewOpen(false);
    setPreviewMeta(null);
    onClose();
  };

  return (
    <>
      <Drawer
        title={
          <span className="note-history-drawer-title">
            <HistoryOutlined />
            <span>历史版本</span>
          </span>
        }
        placement="right"
        size={360}
        open={open}
        onClose={onClose}
        destroyOnHidden
        styles={{ body: { paddingTop: 8 } }}
      >
        <Typography.Paragraph type="secondary" className="note-history-hint">
          在你停止编辑该文件约 30 分钟后，会自动保存一条快照，最多保留 10 条。
        </Typography.Paragraph>
        <Spin spinning={loading}>
          {!loading && items.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史版本" />
          ) : (
            <List
              size="small"
              dataSource={items}
              renderItem={(item) => (
                <List.Item
                  className="note-history-list-item"
                  actions={[
                    <Button type="link" size="small" key="view" onClick={() => void openPreview(item)}>
                      查看
                    </Button>,
                  ]}
                >
                  <Typography.Text ellipsis title={formatSavedAt(item.savedAt)}>
                    {formatSavedAt(item.savedAt)}
                  </Typography.Text>
                </List.Item>
              )}
            />
          )}
        </Spin>
      </Drawer>

      <Modal
        title={previewMeta ? formatSavedAt(previewMeta.savedAt) : "预览"}
        open={previewOpen}
        onCancel={() => {
          setPreviewOpen(false);
          setPreviewMeta(null);
        }}
        width={720}
        footer={[
          <Button key="close" onClick={() => setPreviewOpen(false)}>
            关闭
          </Button>,
          <Button
            key="restore"
            type="primary"
            disabled={previewLoading}
            onClick={() => void handleRestore()}
          >
            恢复为此版本
          </Button>,
        ]}
        destroyOnHidden
      >
        <Spin spinning={previewLoading}>
          <pre className="note-history-preview">{previewText || (previewLoading ? "" : "（空）")}</pre>
        </Spin>
      </Modal>
    </>
  );
};

export default NoteHistoryDrawer;
