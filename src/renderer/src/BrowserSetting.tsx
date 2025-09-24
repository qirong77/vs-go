import { useState, useEffect } from "react";
import { VS_GO_EVENT } from "../../common/EVENT";

type BrowserItem = {
    id: string;
    name: string;
    url: string;
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

    // 获取列表
    const fetchList = async () => {
        setLoading(true);
        const res = await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_LIST);
        setList(res || []);
        setLoading(false);
    };
    useEffect(() => {
        fetchList();
    }, []);

    // 添加
    const handleAdd = async () => {
        if (!name.trim() || !url.trim()) return;
        await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_ADD, { id: uuid(), name, url });
        setName("");
        setUrl("");
        fetchList();
    };
    // 删除
    const handleRemove = async (id: string) => {
        await ipcRenderer.invoke(VS_GO_EVENT.BROWSER_REMOVE, id);
        fetchList();
    };

    // 搜索过滤
    const filtered = search.trim() ? list.filter((i) => i.name.includes(search) || i.url.includes(search)) : list;

    return (
        <div className="p-4 w-full h-full flex flex-col bg-white dark:bg-gray-900">
            <h2 className="mb-4 flex items-center">
                <span role="img" aria-label="browser" className="mr-2">
                    🌐
                </span>
                <span className="text-xl font-bold "> 浏览器设置</span>

                <button className="bg-gray-200 text px-3 py-1 rounded ml-auto">导入书签</button>
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
                <input className="border rounded px-2 py-1 flex-1" placeholder="名称" value={name} onChange={(e) => setName(e.target.value)} />
                <input className="border rounded px-2 py-1 flex-1" placeholder="URL" value={url} onChange={(e) => setUrl(e.target.value)} />
                <button className="bg-blue-500 text-white px-3 py-1 rounded" onClick={handleAdd}>
                    添加
                </button>
            </div>
            <div className="flex-1 overflow-auto border rounded px-2 bg-gray-50 dark:bg-gray-800">
                {loading ? (
                    <div className="text-gray-400 text-center mt-0">加载中...</div>
                ) : filtered.length === 0 ? (
                    <div className="text-gray-400 text-center mt-0">暂无数据</div>
                ) : (
                    <ul>
                        {filtered.map((item) => (
                            <li key={item.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                                <div className="flex-1">
                                    <span className="font-medium mr-2">{item.name}</span>
                                    <span className="text-xs text-gray-500">{item.url}</span>
                                </div>
                                <button className="text-red-500 px-2" onClick={() => handleRemove(item.id)}>
                                    删除
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

export default BrowserSetting;
