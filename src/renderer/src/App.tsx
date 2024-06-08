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
  const openedTimesCounter = new Map<string, number>();
  const ulRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
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
      openedTimesCounter.set(showFiles[active].filePath, (openedTimesCounter.get(showFiles[active].filePath) || 0) + 1);
      setInput("");
      setActive(0);
      return;
    }
  };
  useEffect(() => {
    const { height } = containerRef.current?.getBoundingClientRect() || {};
    if (!height) return;
    window.electron.ipcRenderer.send(VS_GO_EVENT.SET_SEARCH_WINDOW_HEIGHT + 30, height);
  }, [showFiles.length]);
  useEffect(() => {
    ulRef.current?.querySelector(".active-li")?.scrollIntoView(false);
  }, [active]);
  useEffect(() => {
    if (!input) {
      setShowFiles(vscodeOpenedWindowFiles);
      return;
    }
    const newShowFiles = allFiles.sort((file1, file2) => {
      const file1OpenedTimesScore = (openedTimesCounter.get(file1.filePath) || 0) * 100;
      const file2OpenedTimesScore = (openedTimesCounter.get(file2.filePath) || 0) * 100;
      const f1Name = normalizeStr(file1.fileName)
      const f2Name= normalizeStr(file2.fileName)
      const f1NameScore = f1Name.includes(input) ? 100 - f1Name.indexOf(input) : 0;
      const f2NameScore = f2Name.includes(input) ? 100 - f2Name.indexOf(input) : 0;
      const f1Score = file1OpenedTimesScore + f1NameScore;
      const f2Score = file2OpenedTimesScore + f2NameScore;
      return f2Score - f1NameScore;
    });
    setShowFiles(newShowFiles);
  }, [input, vscodeOpenedWindowFiles]);
  useEffect(() => {
    window.electron.ipcRenderer.invoke(VS_GO_EVENT.GET_FILES_LIST).then((res) => {
      setAllFiles(res);
      setShowFiles(res);
    });
    window.electron.ipcRenderer.on(VS_GO_EVENT.MAIN_WINDOW_SHOW, () => {
      // window.electron.ipcRenderer.invoke(VS_GO_EVENT.GET_VSCODE_WINDOW_STATUS).then((res) => {
      //   console.log(res)
      //   // setVscodeOpenedWindow(res);
      // });
    });
    window.electron.ipcRenderer.invoke(VS_GO_EVENT.Test).then((res) => {
      console.log(res)
      // setVscodeOpenedWindow(res);
    });
  }, []);
  return (
    <div className="search-window" ref={containerRef}>
      <div className={`relative flex pl-[20px] w-[100vw] items-center h-[50px] border-b-[1px] border-slate-300`}>
        <SearchIcon />
        <input
          type="text"
          onKeyDown={handleKeyDown}
          onChange={handleInput}
          value={input}
          autoFocus
          className="mx-4 pl-[4px] h-full text-xl outline-none flex-1"
        ></input>
      </div>
      <div>
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
