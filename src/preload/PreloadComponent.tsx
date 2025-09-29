import "@ant-design/v5-patch-for-react-19";
import React, { useCallback, useEffect } from "react";
import { debounce } from "../common/debounce";
import { VS_GO_EVENT } from "../common/EVENT";
import { ipcRenderer } from "electron";
import { BrowserItem } from "../main/electron/store";

const PreLoadComponent: React.FC = () => {
  const [historyList, setHistoryList] = React.useState<BrowserItem[]>([]);
  const searchHistory = useCallback((value = "") => {
    ipcRenderer.invoke(VS_GO_EVENT.FLOATING_WINDOW_SEARCH_URL, value).then((response) => {
      setHistoryList(response || []);
    });
  }, []);
  useEffect(() => {
    const handleDevToolsShortKey = (e: KeyboardEvent) => {
      if (e.key === "F12" || (e.key === "I" && e.ctrlKey && e.altKey)) {
        ipcRenderer.send(VS_GO_EVENT.FLOATING_WINDOW_TOGGLE_DEVTOOLS);
      }
    };
    document.addEventListener("keydown", handleDevToolsShortKey);
  }, []);
  return <h1>Preload Component</h1>;
};
function UrlToolBar() {}
function UrlSelect(props: { options: { key: string; value: string }[] }) {}
function UrlInput() {}

export default PreLoadComponent;
