import { useEffect, useRef, useState } from "react";
import { ArrowRight, SearchIcon } from "./icon";
import { VS_GO_EVENT } from "../../common/EVENT";
import { useFileData } from "./hooks/useFileData";

const { ipcRenderer } = window.electron;

function App() {
  const [active, setActive] = useState(0);
  const [input, setInput] = useState("");
  const ulRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { showFiles: allShowFiles, updateAllFiles } = useFileData(input);
  const showFiles = allShowFiles.filter((f) => !f.browser);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setActive(0);

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(e.metaKey ? 0 : active - 1 < 0 ? showFiles.length - 1 : active - 1);
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(
        e.metaKey ? showFiles.length - 1 : active + 1 > showFiles.length - 1 ? 0 : active + 1
      );
    }

    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      const targetItem = showFiles[active];
      if (targetItem) {
        ipcRenderer.send(VS_GO_EVENT.OPEN_FILE, targetItem);
        setInput("");
        setActive(0);
      }
    }
  };

  useEffect(() => {
    const handleShow = () => {
      setInput("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    };

    ipcRenderer.on(VS_GO_EVENT.MAIN_WINDOW_SHOW, handleShow);
    return () => {
      ipcRenderer.removeAllListeners(VS_GO_EVENT.MAIN_WINDOW_SHOW);
    };
  }, []);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      const { height } = containerRef.current?.getBoundingClientRect() || {};
      if (!height) return;
      ipcRenderer.send(VS_GO_EVENT.SET_SEARCH_WINDOW_HEIGHT, height);
    });
  }, [showFiles.length]);

  useEffect(() => {
    ulRef.current?.querySelector(".active-li")?.scrollIntoView(false);
  }, [active]);

  return (
    <div className="search-window overflow-hidden" ref={containerRef}>
      <div className="relative flex pl-[20px] w-[100vw] items-center h-[50px] border-b-[1px] border-slate-300">
        <SearchIcon />
        <input
          type="text"
          onKeyDown={handleKeyDown}
          onChange={(e) => setInput(e.target.value)}
          value={input}
          ref={inputRef}
          autoFocus
          className="mx-4 pl-[4px] h-full text-xl outline-none flex-1"
        />
      </div>

      {showFiles.length > 0 && (
        <ul ref={ulRef} className="px-[10px] my-[6px] overflow-y-scroll max-h-[300px]">
          {showFiles.map((file, i) => (
            <li
              className={`flex [&>svg]:mx-[6px] [&>svg]:w-[18px] [&>svg]:h-[18px] items-center pl-1 h-[34px] group flex-nowrap overflow-hidden text-ellipsis ${
                i === active ? "active-li" : ""
              }`}
              key={file.filePath + i}
            >
              {file.useAppBase64 && (
                <>
                  <img
                    style={{ maxHeight: "30px" }}
                    src={`data:image/png;base64,${file.useAppBase64}`}
                  />
                  <ArrowRight />
                </>
              )}
              {file.iconBase64 && (
                <img
                  style={{ maxHeight: "26px" }}
                  src={`data:image/png;base64,${file.iconBase64}`}
                />
              )}
              <span className="text-lg pl-[8px] flex-1 overflow-hidden text-ellipsis flex items-center flex-nowrap">
                <span className="text-nowrap">{file.fileName.replace(".app", "")}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default App;
