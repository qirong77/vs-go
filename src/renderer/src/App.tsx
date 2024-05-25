import { useState } from "react";
import { IMainWindowFiles } from "src/common/type";

function App(): JSX.Element {
  const [files, setFiles] = useState<IMainWindowFiles>([]);
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
      <div>
        <input type="text" onKeyDown={handleKeyDown} onChange={handleInput} value={input}></input>123
      </div>
      <div>
        <ul>
          {files.map((file) => {
            return <li>{file.fileName}</li>;
          })}
        </ul>
      </div>
    </div>
  );
}

export default App;