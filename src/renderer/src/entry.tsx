import ReactDOM from "react-dom/client";
import App from "./App";
import AppSetting from "./AppSetting";
import BrowserSetting from "./BrowserSetting";
import CookieManager from "./CookieManager";
import UserNotes from "./UserNotes";
import DisplayManager from "./DisplayManager";
import ScriptEditor from "./ScriptEditor";
import TabbedBrowser from "./TabbedBrowser";

const ROUTES: Record<string, React.FC> = {
  "browser-setting": BrowserSetting,
  "cookie-manager": CookieManager,
  "user-notes": UserNotes,
  "app-setting": AppSetting,
  "display-manager": DisplayManager,
  "script-editor": ScriptEditor,
  "tabbed-browser": TabbedBrowser,
};

const hash = window.location.hash;
const RootComponent =
  Object.entries(ROUTES).find(([key]) => hash.includes(key))?.[1] ?? App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<RootComponent />);
