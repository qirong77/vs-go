import { useState, useEffect } from "react";
import { VS_GO_EVENT } from "../../common/EVENT";
import BookmarkImportModal from "./components/BookmarkImportModal";

type BrowserItem = {
  id: string;
  name: string;
  url: string;
};

type AppSettings = {
  defaultEditor: "vscode" | "cursor";
};

function uuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const { ipcRenderer } = window.electron;

function BrowserSetting() {
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [list, setList] = useState<BrowserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importBookmarks, setImportBookmarks] = useState<BrowserItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>({ defaultEditor: "vscode" });

  // 获取列表
  const fetchList = async () => {
    setLoading(true);
    const res = await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_LIST);
    setList(res || []);
    setLoading(false);
  };

  // 获取 App 设置
  const fetchAppSettings = async () => {
    const res = await ipcRenderer.invoke(VS_GO_EVENT.APP_SETTINGS_GET);
    if (res) setAppSettings(res);
  };

  useEffect(() => {
    fetchList();
    fetchAppSettings();
  }, []);

  // 保存 App 设置
  const handleSaveAppSettings = async (newSettings: AppSettings) => {
    await ipcRenderer.invoke(VS_GO_EVENT.APP_SETTINGS_SET, newSettings);
    setAppSettings(newSettings);
    setAppSettingsOpen(false);
  };

  // 添加
  const handleAdd = async () => {
    if (!name.trim() || !url.trim()) return;
    await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_ADD, {
      id: uuid(),
      name,
      url,
    });
    setName("");
    setUrl("");
    fetchList();
  };
  // 删除
  const handleRemove = async (url: string) => {
    await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_REMOVE, url).then(() => {
      fetchList();
    });
  };
  // 删除所有
  const handleRemoveAll = async () => {
    ipcRenderer.invoke(VS_GO_EVENT.BROWSER_REMOVE_ALL).then(() => {
      fetchList();
    });
  };

  // 导入书签 - 选择文件
  const handleImportBookmarks = async () => {
    try {
      setImporting(true);
      const bookmarks = await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_IMPORT_SELECT_FILE);

      if (bookmarks && bookmarks.length > 0) {
        setImportBookmarks(bookmarks);
        setImportModalOpen(true);
      } else if (bookmarks && bookmarks.length === 0) {
        alert("所选文件中没有找到有效的书签");
      }
    } catch (error) {
      console.error("导入书签失败:", error);
      alert(error instanceof Error ? error.message : "导入书签失败，请重试");
    } finally {
      setImporting(false);
    }
  };

  // 确认导入选中的书签
  const handleConfirmImport = async (selectedBookmarks: BrowserItem[]) => {
    try {
      const result = await ipcRenderer.invoke(
        VS_GO_EVENT.BROWSER_IMPORT_BOOKMARKS,
        selectedBookmarks
      );

      setImportModalOpen(false);
      setImportBookmarks([]);

      // 显示导入结果
      const message = `成功导入 ${result.imported} 个书签${
        result.duplicate > 0 ? `，跳过 ${result.duplicate} 个重复书签` : ""
      }`;
      alert(message);

      // 刷新列表
      await fetchList();
    } catch (error) {
      console.error("导入书签失败:", error);
      alert("导入书签失败，请重试");
    }
  };

  // 关闭导入弹窗
  const handleCloseImportModal = () => {
    setImportModalOpen(false);
    setImportBookmarks([]);
  };
  // 搜索过滤
  const filtered = search.trim()
    ? list.filter((i) => i.name.includes(search) || i.url.includes(search))
    : list;

  return (
    <div className="p-4 w-full h-full flex flex-col bg-white dark:bg-gray-900">
      <h2 className="mb-4 flex items-center">
        <span role="img" aria-label="browser" className="mr-2">
          🌐
        </span>
        <span className="text-xl font-bold "> 浏览器设置</span>
        <button
          className="bg-gray-200 text px-3 py-1 rounded ml-auto hover:bg-gray-300 transition-colors"
          onClick={() => setAppSettingsOpen(true)}
        >
          ⚙️ App 设置
        </button>
        <button
          className="bg-gray-200 text px-3 py-1 rounded ml-4 hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleImportBookmarks}
          disabled={importing}
        >
          {importing ? "导入中..." : "导入书签"}
        </button>
        <button
          className="bg-gray-200 text px-3 py-1 rounded ml-4"
          onClick={() => handleRemoveAll()}
        >
          删除所有
        </button>
      </h2>
      <div className="mb-4 flex gap-2">
        <input
          className="border rounded px-2 py-1 flex-1"
          placeholder="搜索名称/URL"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="mb-4 flex gap-2">
        <input
          className="border rounded px-2 py-1 flex-1"
          placeholder="名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="border rounded px-2 py-1 flex-1"
          placeholder="URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button className="bg-blue-500 text-white px-3 py-1 rounded" onClick={handleAdd}>
          添加
        </button>
      </div>
      <div className="flex-1 overflow-auto border rounded px-2 bg-gray-50 dark:bg-gray-800">
        {loading ? (
          <div className="text-gray-400 text-center mt-0">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="text-gray-400 text-center my-2">暂无数据</div>
        ) : (
          <ul className="h-[300px] overflow-scroll">
            {filtered.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between py-2 border-b last:border-b-0"
              >
                <div className="flex-1">
                  <span className="font-medium mr-2">
                    {item.name?.length > 30 ? item.name.slice(0, 30) + "..." : item.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    {item.url?.length > 30 ? item.url.slice(0, 30) + "..." : item.url}
                  </span>
                </div>
                <button className="text-red-500 px-2" onClick={() => handleRemove(item.url)}>
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 导入书签弹窗 */}
      <BookmarkImportModal
        isOpen={importModalOpen}
        bookmarks={importBookmarks}
        onClose={handleCloseImportModal}
        onImport={handleConfirmImport}
      />

      {/* App 设置弹窗 */}
      {appSettingsOpen && (
        <AppSettingsModal
          settings={appSettings}
          onClose={() => setAppSettingsOpen(false)}
          onSave={handleSaveAppSettings}
        />
      )}
    </div>
  );
}

// App 设置弹窗组件
function AppSettingsModal({
  settings,
  onClose,
  onSave,
}: {
  settings: AppSettings;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
}) {
  const [editor, setEditor] = useState<"vscode" | "cursor">(settings.defaultEditor);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-80 p-6">
        <h3 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-100">⚙️ App 设置</h3>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            默认打开项目的编辑器
          </label>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="editor"
                value="vscode"
                checked={editor === "vscode"}
                onChange={() => setEditor("vscode")}
                className="w-4 h-4 accent-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-200">
                Visual Studio Code
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer opacity-50">
              <input
                type="radio"
                name="editor"
                value="cursor"
                checked={editor === "cursor"}
                onChange={() => setEditor("cursor")}
                disabled
                className="w-4 h-4"
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Cursor <span className="text-xs text-gray-400">（暂不支持）</span>
              </span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-1.5 rounded bg-gray-200 dark:bg-gray-600 text-sm hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="px-4 py-1.5 rounded bg-blue-500 text-white text-sm hover:bg-blue-600 transition-colors"
            onClick={() => onSave({ defaultEditor: editor })}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

export default BrowserSetting;
