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
        return fName.includes(searchValue.trim()) || file.browser?.url.includes(searchValue.trim());
      })
      .sort((file1, file2) => {
        const f1Name = normalizeStr(file1.fileName);
        const f2Name = normalizeStr(file2.fileName);
        const normalizedSearch = searchValue.trim();

        // 如果没有搜索内容，仅按最后访问时间排序
        if (!normalizedSearch) {
          const f1AccessTime = file1.lastAccessTime || 0;
          const f2AccessTime = file2.lastAccessTime || 0;
          return f2AccessTime - f1AccessTime; // 最近访问的排在前面
        }

        // 计算搜索匹配度分数
        const f1Index = f1Name.indexOf(normalizedSearch);
        const f2Index = f2Name.indexOf(normalizedSearch);
        const f1NameScore = f1Index === -1 ? 0 : 100 - f1Index;
        const f2NameScore = f2Index === -1 ? 0 : 100 - f2Index;

        // 计算访问时间权重（最近7天内的访问会获得额外加权）
        const now = Date.now();
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        const f1AccessTime = file1.lastAccessTime || 0;
        const f2AccessTime = file2.lastAccessTime || 0;

        const f1TimeBonus = f1AccessTime > 0 && now - f1AccessTime < oneWeek ? 20 : 0;
        const f2TimeBonus = f2AccessTime > 0 && now - f2AccessTime < oneWeek ? 20 : 0;

        const f1UrlScore = file1.browser?.name.includes(normalizedSearch) || file1.browser?.url.includes(normalizedSearch) ? 1 : 0;
        const f2UrlScore = file2.browser?.name.includes(normalizedSearch) || file2.browser?.url.includes(normalizedSearch) ? 1 : 0;
        // 综合分数：搜索匹配度 + 时间加权
        const f1TotalScore = f1NameScore + f1TimeBonus + f1UrlScore;
        const f2TotalScore = f2NameScore + f2TimeBonus + f2UrlScore;

        // 如果综合分数相同，则按最后访问时间排序
        if (f1TotalScore === f2TotalScore) {
          return f2AccessTime - f1AccessTime;
        }

        return f2TotalScore - f1TotalScore;
      });
    const extra: IMainWindowFiles = [];
    setShowFiles([...newShowFiles,...extra]);
  }, [searchValue, allFiles]);
  return { showFiles, updateAllFiles };
}

function normalizeStr(str = ""): string {
  return pinyin(str, {
    style: "normal",
  })
    .join("")
    .toLowerCase();
}
