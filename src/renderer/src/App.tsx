import { useEffect, useRef, useState } from "react";

import { ArrowRight, SearchIcon } from "./icon";
import { VS_GO_EVENT } from "../../common/EVENT";
import { IMainWindowFiles } from "../../common/type";
import { debounce } from "../../common/debounce";

function App(): JSX.Element {
  const [files, setFiles] = useState<IMainWindowFiles>([]);
  const [active, setActive] = useState(0);
  const [input, setInput] = useState("");
  const ulRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };
  const updateFiles = debounce((value = "") => {
    window.electron.ipcRenderer.invoke(VS_GO_EVENT.GET_FILES_LIST, value).then((res) => {
      setFiles(res);
      const { height } = containerRef.current?.getBoundingClientRect() || {};
      if (!height) return;
      window.electron.ipcRenderer.send(VS_GO_EVENT.SET_SEARCH_WINDOW_HEIGHT + 30, height);
    });
  }, 300)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.metaKey ? setActive(0) : setActive(active - 1 < 0 ? files.length - 1 : active - 1);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.metaKey ? setActive(files.length - 1) : setActive(active + 1 > files.length - 1 ? 0 : active + 1);
    }
    if (e.key === "Enter") {
      return;
    }
    updateFiles(e.target.value);
  };
  useEffect(() => {
    updateFiles();
  }, []);
  useEffect(() => {
    ulRef.current?.querySelector(".active-li")?.scrollIntoView(false);
  }, [active]);
  return (
    <div className="search-window" ref={containerRef}>
      <div className={`relative flex pl-[20px] w-[100vw] items-center h-[50px] border-b-[1px] border-slate-300`}>
        <SearchIcon />
        <input
          type="text"
          onKeyDown={handleKeyDown}
          onChange={handleInput}
          value={input}
          className="mx-4 pl-[4px] h-full text-xl outline-none flex-1"
        ></input>
      </div>
      <div>
        <ul ref={ulRef} className="px-[10px] my-[6px] overflow-y-scroll max-h-[300px]">
          {files.map((file, i) => {
            return (
              <li
                className={`flex [&>svg]:mx-[6px] [&>svg]:w-[18px] [&>svg]:h-[18px] items-center  pl-1 h-[34px] ${
                  i === active ? "active-li" : ""
                }`}
                key={file.filePath + i}
              >
                {file?.useAppBase64 && (
                  <>
                    <img
                      style={{
                        maxHeight: "30px",
                      }}
                      src={"data:image/png;base64," + file.useAppBase64}
                    />
                    <ArrowRight />
                  </>
                )}
                <img
                  style={{
                    maxHeight: "26px",
                  }}
                  src={"data:image/png;base64," + file.iconBase64}
                />
                <span className="text-lg pl-[8px]">{file.fileName.replace(".app", "")} </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default App;
