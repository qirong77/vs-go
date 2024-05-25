import { useState } from "react";
import { IMainWindowFiles } from "src/common/type";
import { ArrowRight } from "./icon";

function App(): JSX.Element {
  const [files, ] = useState<IMainWindowFiles>([]);
  const [active, setActive] = useState(0);
  const [input, setInput] = useState("");
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };
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
    }
  };
  return (
    <div>
      <div className={`relative flex pl-[20px] w-[100vw] items-center h-[50px] border-b-[1px] border-slate-300`}>
        <input
          type="text"
          onKeyDown={handleKeyDown}
          onChange={handleInput}
          value={input}
          className="mx-4 pl-[4px] h-full text-xl outline-none flex-1"
        ></input>
        123
      </div>
      <div>
        <ul className="px-[10px] my-[6px] overflow-y-scroll h-[300px]">
          {files.map((file, i) => {
            return (
              <li
              className={`flex [&>svg]:mx-[6px] [&>svg]:w-[18px] [&>svg]:h-[18px] items-center  pl-1 h-[34px] ${
                i === active ? 'active-li' : ''
              }`}
              key={file.filePath + i}
            >
              {file?.appIcon && (
                <>
                  <img
                    style={{
                      maxHeight: '30px'
                    }}
                    src={'data:image/png;base64,' + file.appIcon}
                  />
                  <ArrowRight />
                </>
              )}
              <span className="mx-[6px]">
                {file.iconPath && (
                  <img className="h-[20px]" src={'data:image/png;base64,' + file.iconPath} />
                )}
              </span>
              <span className="text-lg">{file.fileName.replace('.app', '')} </span>
            </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default App;
