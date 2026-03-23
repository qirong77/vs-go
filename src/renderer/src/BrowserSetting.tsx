import { useState, useEffect } from "react";
import { VS_GO_EVENT } from "../../common/EVENT";
import { generateId } from "../../common/utils";
import type { BrowserItem } from "../../common/type";
import BookmarkImportModal from "./components/BookmarkImportModal";

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

  const fetchList = async () => {
    setLoading(true);
    const res = await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_LIST);
    setList(res || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchList();
  }, []);

  const handleAdd = async () => {
    if (!name.trim() || !url.trim()) return;
    await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_ADD, {
      id: generateId(),
      name: name.trim(),
      url: url.trim(),
      type: "bookmark",
    } satisfies BrowserItem);
    setName("");
    setUrl("");
    fetchList();
  };

  const handleRemove = async (browserUrl: string) => {
    await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_REMOVE, browserUrl);
    fetchList();
  };

  const handleRemoveAll = async () => {
    await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_REMOVE_ALL);
    fetchList();
  };

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

  const handleConfirmImport = async (selectedBookmarks: BrowserItem[]) => {
    try {
      const result = await ipcRenderer.invoke(
        VS_GO_EVENT.BROWSER_IMPORT_BOOKMARKS,
        selectedBookmarks
      );

      setImportModalOpen(false);
      setImportBookmarks([]);

      const message = `成功导入 ${result.imported} 个书签${
        result.duplicate > 0 ? `，跳过 ${result.duplicate} 个重复书签` : ""
      }`;
      alert(message);
      await fetchList();
    } catch (error) {
      console.error("导入书签失败:", error);
      alert("导入书签失败，请重试");
    }
  };

  const handleCloseImportModal = () => {
    setImportModalOpen(false);
    setImportBookmarks([]);
  };

  const filtered = search.trim()
    ? list.filter((i) => i.name.includes(search) || i.url.includes(search))
    : list;

  return (
    <div className="p-4 w-full h-full flex flex-col bg-white dark:bg-gray-900">
      <h2 className="mb-4 flex items-center">
        <span role="img" aria-label="browser" className="mr-2">
          🌐
        </span>
        <span className="text-xl font-bold">浏览器设置</span>
        <button
          className="bg-gray-200 px-3 py-1 rounded ml-auto hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleImportBookmarks}
          disabled={importing}
        >
          {importing ? "导入中..." : "导入书签"}
        </button>
        <button
          className="bg-gray-200 px-3 py-1 rounded ml-4 hover:bg-gray-300 transition-colors"
          onClick={handleRemoveAll}
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
          <div className="text-gray-400 text-center mt-4">加载中...</div>
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
                    {item.name.length > 30 ? `${item.name.slice(0, 30)}...` : item.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    {item.url.length > 30 ? `${item.url.slice(0, 30)}...` : item.url}
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

      <BookmarkImportModal
        isOpen={importModalOpen}
        bookmarks={importBookmarks}
        onClose={handleCloseImportModal}
        onImport={handleConfirmImport}
      />
    </div>
  );
}

export default BrowserSetting;
