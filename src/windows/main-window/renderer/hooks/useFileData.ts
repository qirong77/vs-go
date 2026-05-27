import { useCallback, useEffect, useState } from "react";
import type { IMainWindowFiles } from "@shared/type";
import { MainWindowEvent } from "@windows/main-window/events";
import pinyin from "pinyin";

const { ipcRenderer } = window.electron;

function normalizeStr(str = ""): string {
  return (pinyin as any)(str, { style: "normal" }).join("").toLowerCase();
}

export function useFileData(searchValue: string) {
  const [allFiles, setAllFiles] = useState<IMainWindowFiles>([]);
  const [showFiles, setShowFiles] = useState<IMainWindowFiles>([]);

  const applyFiles = useCallback((res: IMainWindowFiles) => {
    setAllFiles(res);
  }, []);

  const updateAllFiles = useCallback(() => {
    ipcRenderer.invoke(MainWindowEvent.GET_FILES_LIST).then(applyFiles);
  }, [applyFiles]);

  useEffect(() => {
    const onShow = (_e: unknown, cached?: IMainWindowFiles) => {
      if (cached && cached.length > 0) applyFiles(cached);
      updateAllFiles();
    };
    ipcRenderer.on(MainWindowEvent.MAIN_WINDOW_SHOW, onShow);
    return () => {
      ipcRenderer.removeAllListeners(MainWindowEvent.MAIN_WINDOW_SHOW);
    };
  }, [applyFiles, updateAllFiles]);

  useEffect(() => {
    const trimmedSearch = searchValue.trim();

    const filtered = allFiles
      .filter((file) => {
        const fName = normalizeStr(file.fileName);
        return (
          fName.includes(trimmedSearch) || file.browser?.url?.includes(trimmedSearch) || false
        );
      })
      .sort((a, b) => {
        if (!trimmedSearch) {
          return (b.lastAccessTime || 0) - (a.lastAccessTime || 0);
        }

        const aName = normalizeStr(a.fileName);
        const bName = normalizeStr(b.fileName);

        const aNameIdx = aName.indexOf(trimmedSearch);
        const bNameIdx = bName.indexOf(trimmedSearch);
        const aNameScore = aNameIdx === -1 ? 0 : 100 - aNameIdx;
        const bNameScore = bNameIdx === -1 ? 0 : 100 - bNameIdx;

        const now = Date.now();
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        const aTimeBonus =
          a.lastAccessTime && now - a.lastAccessTime < oneWeek ? 20 : 0;
        const bTimeBonus =
          b.lastAccessTime && now - b.lastAccessTime < oneWeek ? 20 : 0;

        const aUrlScore =
          a.browser?.name.includes(trimmedSearch) || a.browser?.url?.includes(trimmedSearch)
            ? 1
            : 0;
        const bUrlScore =
          b.browser?.name.includes(trimmedSearch) || b.browser?.url?.includes(trimmedSearch)
            ? 1
            : 0;

        const aTotal = aNameScore + aTimeBonus + aUrlScore;
        const bTotal = bNameScore + bTimeBonus + bUrlScore;

        if (aTotal === bTotal) {
          return (b.lastAccessTime || 0) - (a.lastAccessTime || 0);
        }
        return bTotal - aTotal;
      });

    setShowFiles(filtered);
  }, [searchValue, allFiles]);

  return { showFiles, updateAllFiles };
}
