import React, { useState, useEffect } from "react";
import { Button, message, Empty, Card, Typography } from "antd";
import { VS_GO_EVENT } from "../../common/EVENT";
import { SavedCookieByUrl } from "../../common/type";

const { Title, Text } = Typography;

const CookieManager: React.FC = () => {
  const [savedCookies, setSavedCookies] = useState<SavedCookieByUrl[]>([]);
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    loadSavedCookies();

    // 监听当前URL更新
    window.electron.ipcRenderer.on("update-current-url", (_event, url: string) => {
      setCurrentUrl(url);
    });

    return () => {
      window.electron.ipcRenderer.removeAllListeners("update-current-url");
    };
  }, []);

  const loadSavedCookies = async () => {
    try {
      const cookies = await window.electron.ipcRenderer.invoke(
        VS_GO_EVENT.COOKIE_GET_SAVED_LIST_BY_URL
      );
      setSavedCookies(cookies);
    } catch (error) {
      console.error("加载Cookie列表失败:", error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const result = await window.electron.ipcRenderer.invoke(VS_GO_EVENT.COOKIE_DELETE_BY_URL, id);
      if (result.success) {
        messageApi.success("删除成功");
        await loadSavedCookies();
      } else {
        messageApi.error(`删除失败: ${result.error}`);
      }
    } catch (error) {
      console.error("删除Cookie失败:", error);
      messageApi.error("删除Cookie失败");
    }
  };

  const handleApply = async (cookie: SavedCookieByUrl) => {
    if (!currentUrl) {
      messageApi.warning("请先打开一个网页");
      return;
    }

    setLoading(true);
    try {
      const result = await window.electron.ipcRenderer.invoke(
        VS_GO_EVENT.COOKIE_APPLY_BY_URL,
        cookie,
        currentUrl
      );
      if (result.success) {
        messageApi.success(`成功应用 ${result.count} 个Cookie`);
      } else {
        messageApi.error(`应用失败: ${result.error}`);
      }
    } catch (error) {
      console.error("应用Cookie失败:", error);
      messageApi.error("应用Cookie失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCurrent = async () => {
    if (!currentUrl) {
      messageApi.warning("请先打开一个网页");
      return;
    }

    setLoading(true);
    try {
      const result = await window.electron.ipcRenderer.invoke(
        VS_GO_EVENT.COOKIE_SAVE_BY_URL,
        currentUrl
      );
      if (result.success) {
        messageApi.success(`成功保存 ${result.cookie.domain} 的 Cookie`);
        await loadSavedCookies();
      } else {
        messageApi.error(`保存失败: ${result.error}`);
      }
    } catch (error) {
      console.error("保存Cookie失败:", error);
      messageApi.error("保存Cookie失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {contextHolder}
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <Title level={3} style={{ margin: 0 }}>
              Cookie 管理
            </Title>
            {currentUrl && (
              <Button
                type="primary"
                onClick={handleSaveCurrent}
                loading={loading}
                style={{ backgroundColor: "#52c41a", borderColor: "#52c41a" }}
              >
                保存当前页面
              </Button>
            )}
          </div>

          {currentUrl && (
            <Card size="small" className="mb-4" style={{ backgroundColor: "#e6f4ff" }}>
              <Text type="secondary">当前: </Text>
              <Text code>{currentUrl}</Text>
            </Card>
          )}

          {savedCookies.length === 0 ? (
            <Card>
              <Empty description="暂无保存的 Cookie" />
            </Card>
          ) : (
            <div className="space-y-3">
              {savedCookies.map((cookie) => (
                <Card key={cookie.id} size="small" hoverable>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center flex-1 min-w-0">
                      <Text strong className="truncate block">
                        {cookie.domain}
                      </Text>
                      <Text
                        type="secondary"
                        className="ml-4 whitespace-nowrap"
                      >
                        {cookie.saveTimeDisplay}
                      </Text>
                    </div>

                    <Button
                      type="primary"
                      onClick={() => handleApply(cookie)}
                      disabled={loading || !currentUrl}
                    >
                      应用
                    </Button>
                    <Button danger onClick={() => handleDelete(cookie.id)} disabled={loading}>
                      删除
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CookieManager;
