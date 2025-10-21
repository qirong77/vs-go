import { useEffect, useRef, useState } from "react";

import { ArrowRight, SearchIcon, DeleteIcon } from "./icon";
import { VS_GO_EVENT } from "../../common/EVENT";
import { useFileData } from "./hooks/useFileData";

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        send: (channel: string, ...args: any[]) => void;
        on: (channel: string, func: (...args: any[]) => void) => void;
        removeAllListeners: (channel: string) => void;
        invoke: (channel: string, ...args: any[]) => Promise<any>;
      };
    };
  }
}

function App() {
  const [active, setActive] = useState(0);
  const [input, setInput] = useState("");
  const ulRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { showFiles, updateAllFiles } = useFileData(input);

  // 删除浏览器记录
  const handleDeleteBrowser = async (e: React.MouseEvent, browserUrl: string) => {
    e.stopPropagation();
    try {
      await window.electron.ipcRenderer.invoke(VS_GO_EVENT.BROWSER_REMOVE, browserUrl);
      updateAllFiles();
    } catch (error) {
      console.error("删除浏览器记录失败:", error);
    }
  };
  // const [browserItem, setBrowserItem] = useState<any>();
  // 搜索框为空时的默认展示,Vscode已打开的文件和打开的文件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setActive(0);
    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.metaKey ? setActive(0) : setActive(active - 1 < 0 ? showFiles.length - 1 : active - 1);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.metaKey
        ? setActive(showFiles.length - 1)
        : setActive(active + 1 > showFiles.length - 1 ? 0 : active + 1);
    }
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      const targetItem = showFiles[active];
      if (targetItem?.browser) {
        window.electron.ipcRenderer.send(VS_GO_EVENT.FLOATING_WINDOW_CREATE, targetItem.browser);
        return;
      }
      if (targetItem) {
        window.electron.ipcRenderer.send(VS_GO_EVENT.OPEN_FILE, targetItem);
        setInput("");
        setActive(0);
        return;
      }
      const isUrl = /^(http|https):\/\/[^ "]+$/.test(input);
      if (isUrl) {
        window.electron.ipcRenderer.send(VS_GO_EVENT.FLOATING_WINDOW_CREATE, {
          url: input.trim(),
          name: input.trim(),
          id: new Date().getTime() + "",
        });
        setInput("");
        setActive(0);
        return;
      }
    }
  };
  useEffect(() => {
    window.electron.ipcRenderer.on(VS_GO_EVENT.MAIN_WINDOW_SHOW, () => {
      setInput("");
      setActive(0);
      inputRef.current?.focus();
    });
    return () => {
      window.electron.ipcRenderer.removeAllListeners(VS_GO_EVENT.MAIN_WINDOW_SHOW);
    };
  }, []);
  useEffect(() => {
    window.requestAnimationFrame(() => {
      const { height } = containerRef.current?.getBoundingClientRect() || {};
      if (!height) return;
      window.electron.ipcRenderer.send(VS_GO_EVENT.SET_SEARCH_WINDOW_HEIGHT, height);
    });
  }, [showFiles.length]);
  useEffect(() => {
    ulRef.current?.querySelector(".active-li")?.scrollIntoView(false);
  }, [active]);
  return (
    <div className="search-window overflow-hidden" ref={containerRef}>
      <div
        className={`relative flex pl-[20px] w-[100vw] items-center h-[50px] border-b-[1px] border-slate-300`}
      >
        <SearchIcon />
        <input
          type="text"
          onKeyDown={handleKeyDown}
          onChange={(e) => setInput(e.target.value)}
          value={input}
          ref={inputRef}
          autoFocus
          className="mx-4 pl-[4px] h-full text-xl outline-none flex-1"
        ></input>
      </div>

      <div style={{ display: showFiles.length ? "block" : "none" }}>
        <ul ref={ulRef} className="px-[10px] my-[6px] overflow-y-scroll max-h-[300px]">
          {showFiles.map((file, i) => {
            return (
              <li
                className={`flex [&>svg]:mx-[6px] [&>svg]:w-[18px] [&>svg]:h-[18px] items-center  pl-1 h-[34px] group flex-nowrap overflow-hidden text-ellipsis
                  ${i === active ? "active-li" : ""}
                  `}
                key={file.filePath + i}
              >
                {file?.useAppBase64 && (
                  <>
                    <img
                      style={{ maxHeight: "30px" }}
                      src={"data:image/png;base64," + file.useAppBase64}
                    />
                    <ArrowRight />
                  </>
                )}
                {file.iconBase64 && (
                  <img
                    style={{ maxHeight: "26px" }}
                    src={"data:image/png;base64," + file.iconBase64}
                  />
                )}
                {file.browser && <span className="ml-1 text-lg">🌐</span>}
                <span className="text-lg pl-[8px] flex-1 overflow-hidden text-ellipsis flex items-center flex-nowrap">
                  <span className=" text-nowrap">{file.fileName.replace(".app", "")}{" "}</span>
                  <span className="ml-2 text-slate-300 text-sm">
                    {file.browser?.url
                      ? file.browser.url.slice(0, 70) + (file.browser.url.length > 50 ? "......" : "")
                      : ""}
                  </span>
                </span>
          
                {/* 删除按钮，只对浏览器记录显示 */}
                {file.browser && (
                  <button
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-all duration-200 mr-2"
                    onClick={(e) => handleDeleteBrowser(e, file.browser!.url)}
                    title="删除浏览器记录"
                  >
                    <DeleteIcon className="w-4 h-4 text-red-500 hover:text-red-700" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {/* <IfComponent condition={!!browserItem?.url}>
                <div style={{ border: "1px solid #eee" }}>
                    <iframe src={browserItem?.url} style={{ width: "100%", minHeight: "500px" }}></iframe>
                </div>
            </IfComponent> */}
    </div>
  );
}
export function IfComponent({ condition, children }) {
  return condition ? children : null;
}
export default App;
