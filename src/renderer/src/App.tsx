import { useEffect, useRef, useState } from "react";
import pinyin from "pinyin";
import { ArrowRight, SearchIcon } from "./icon";
import { VS_GO_EVENT } from "../../common/EVENT";
import { IMainWindowFiles } from "../../common/type";
import { debounce } from "../../common/debounce";
function App(): JSX.Element {
  const [showFiles, setShowFiles] = useState<IMainWindowFiles>([]);
  const [allFiles, setAllFiles] = useState<IMainWindowFiles>([]);
  const [active, setActive] = useState(0);
  const [input, setInput] = useState("");
  const [vscodeOpenedWindowFiles, setVscodeOpenedWindowFiles] = useState<IMainWindowFiles[]>([]);
  const [openedFileTimes,setOpenedFileTimes] = useState({})
  const ulRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };
  const updateDefaultFiles = () => {
    inputRef.current?.focus();
    window.electron.ipcRenderer.invoke(VS_GO_EVENT.GET_VSCODE_WINDOW_FIELS).then(([res,newOpendFileTimes]) => {
      setOpenedFileTimes(newOpendFileTimes);
      const openedFiles = allFiles
        .filter((file) => {
          return openedFileTimes[file.filePath];
        })
        .sort((file1, file2) => {
          return openedFileTimes[file1.filePath] - openedFileTimes[file2.filePath]
        });
      setVscodeOpenedWindowFiles(res);
      if (!inputRef.current?.value?.trim()) return;
      setShowFiles([...res, ...openedFiles]);
    });
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.metaKey ? setActive(0) : setActive(active - 1 < 0 ? showFiles.length - 1 : active - 1);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.metaKey ? setActive(showFiles.length - 1) : setActive(active + 1 > showFiles.length - 1 ? 0 : active + 1);
    }
    if (e.key === "Enter") {
      window.electron.ipcRenderer.send(VS_GO_EVENT.OPEN_FILE, showFiles[active].filePath);
      setInput("");
      setActive(0);
      updateDefaultFiles()
      return;
    }
  };
  useEffect(() => {
    window.requestAnimationFrame(() => {
      const { height } = containerRef.current?.getBoundingClientRect() || {};
      if (!height) return;
      window.electron.ipcRenderer.send(VS_GO_EVENT.SET_SEARCH_WINDOW_HEIGHT,height + (showFiles.length ? 15 : 5));
    });
  }, [showFiles]);
  useEffect(() => {
    ulRef.current?.querySelector(".active-li")?.scrollIntoView(false);
  }, [active]);
  useEffect(() => {
    if (!input) {
      setShowFiles(vscodeOpenedWindowFiles);
      return;
    }
    const newShowFiles = allFiles
      .filter((file) => {
        const fName = normalizeStr(file.fileName);
        return fName.includes(input);
      })
      .sort((file1, file2) => {
        const file1OpenedTimesScore = (openedFileTimes[file1.filePath] || 0 )* 1000;
        const file2OpenedTimesScore = (openedFileTimes[file2.filePath] || 0) * 1000;
        const f1Name = normalizeStr(file1.fileName);
        const f2Name = normalizeStr(file2.fileName);
        const f1NameScore = 100 - f1Name.indexOf(input);
        const f2NameScore = 100 - f2Name.indexOf(input);
        const f1Score = file1OpenedTimesScore + f1NameScore;
        const f2Score = file2OpenedTimesScore + f2NameScore;
        return f2Score - f1Score;
      });
    setShowFiles(newShowFiles);
  }, [input, vscodeOpenedWindowFiles]);
  useEffect(() => {
    window.electron.ipcRenderer.invoke(VS_GO_EVENT.GET_FILES_LIST).then((res) => {
      setAllFiles(res);
      updateDefaultFiles();
    });
  }, []);
  return (
    <div className="search-window overflow-hidden" ref={containerRef}>
      <div className={`relative flex pl-[20px] w-[100vw] items-center h-[50px] border-b-[1px] border-slate-300`}>
        <SearchIcon />
        <input
          type="text"
          onKeyDown={handleKeyDown}
          onChange={handleInput}
          value={input}
          ref={inputRef}
          autoFocus
          className="mx-4 pl-[4px] h-full text-xl outline-none flex-1"
        ></input>
      </div>
      <div
        style={{
          display: showFiles.length ? "block" : "none",
        }}
      >
        <ul ref={ulRef} className="px-[10px] my-[6px] overflow-y-scroll max-h-[300px]">
          {showFiles.map((file, i) => {
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
function normalizeStr(str = ""): string {
  return pinyin(str, {
    style: "normal",
  })
    .join("")
    .toLowerCase();
}

export default App;
