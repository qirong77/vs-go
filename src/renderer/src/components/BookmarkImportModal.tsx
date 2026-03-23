import { useState, useEffect } from "react";
import type { BrowserItem } from "../../../common/type";

interface BookmarkImportModalProps {
  isOpen: boolean;
  bookmarks: BrowserItem[];
  onClose: () => void;
  onImport: (selectedBookmarks: BrowserItem[]) => void;
}

export default function BookmarkImportModal({
  isOpen,
  bookmarks,
  onClose,
  onImport,
}: BookmarkImportModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (bookmarks.length > 0) {
      setSelectedIds(new Set(bookmarks.map((b) => b.id)));
      setSelectAll(true);
    }
  }, [bookmarks]);

  const filteredBookmarks = bookmarks.filter(
    (b) =>
      b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.url.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
    setSelectAll(next.size === bookmarks.length);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredBookmarks.map((b) => b.id)));
    }
    setSelectAll(!selectAll);
  };

  const handleImport = () => {
    onImport(bookmarks.filter((b) => selectedIds.has(b.id)));
  };

  if (!isOpen) return null;

  const selectedCount = selectedIds.size;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-11/12 max-w-4xl max-h-5/6 flex flex-col">
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">导入书签</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              找到 {bookmarks.length} 个书签，已选择 {selectedCount} 个
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="p-4 border-b dark:border-gray-700 space-y-3">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="搜索书签..."
              className="flex-1 px-3 py-2 border rounded-md dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button
              onClick={handleSelectAll}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md transition-colors"
            >
              {selectAll ? "取消全选" : "全选"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {filteredBookmarks.length === 0 ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              {searchTerm ? "没有找到匹配的书签" : "没有可导入的书签"}
            </div>
          ) : (
            <div className="space-y-2 h-[250px]">
              {filteredBookmarks.map((bookmark) => (
                <div
                  key={bookmark.id}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(bookmark.id)}
                    onChange={() => handleToggle(bookmark.id)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white truncate">
                      {bookmark.name}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {bookmark.url}
                    </div>
                  </div>
                  <a
                    href={bookmark.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    预览
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-6 border-t dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            将导入 {selectedCount} 个书签
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleImport}
              disabled={selectedCount === 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md transition-colors disabled:cursor-not-allowed"
            >
              导入 ({selectedCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
