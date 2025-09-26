import { useCallback, useEffect, useState } from "react";
import { IMainWindowFiles } from "../../../common/type";
import { VS_GO_EVENT } from "../../../common/EVENT";
// @ts-ignore
import pinyin from "pinyin";
export function useFileData(searchValue: string) {
  const [allFiles, setAllFiles] = useState<IMainWindowFiles>([]);
  const [showFiles, setShowFiles] = useState<IMainWindowFiles>([]);

  const updateAllFiles = useCallback(() => {
    window.electron.ipcRenderer.invoke(VS_GO_EVENT.GET_FILES_LIST).then((res) => {
      setAllFiles(res);
    });
  }, []);
  useEffect(() => {
    window.electron.ipcRenderer.on(VS_GO_EVENT.MAIN_WINDOW_SHOW, updateAllFiles);
    return () => {
      window.electron.ipcRenderer.removeAllListeners(VS_GO_EVENT.MAIN_WINDOW_SHOW);
    };
  }, [updateAllFiles]);
  useEffect(() => {
    const newShowFiles = allFiles
      .filter((file) => {
        const fName = normalizeStr(file.fileName);
        return fName.includes(searchValue.trim());
      })
      .sort((file1, file2) => {
        const f1Name = normalizeStr(file1.fileName);
        const f2Name = normalizeStr(file2.fileName);
        const f1NameScore = 100 - f1Name.indexOf(searchValue);
        const f2NameScore = 100 - f2Name.indexOf(searchValue);
        return f2NameScore - f1NameScore;
      });
    setShowFiles(newShowFiles);
  }, [searchValue, allFiles]);
  return { showFiles,updateAllFiles };
}

function normalizeStr(str = ""): string {
  return pinyin(str, {
    style: "normal",
  })
    .join("")
    .toLowerCase();
}
