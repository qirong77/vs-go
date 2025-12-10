import ReactDOM from "react-dom/client";
import App from "./App";
import BrowserSetting from "./BrowserSetting";
import { Terminal } from "./Terminal";
import CookieManager from "./CookieManager";

const hash = window.location.hash;
const root = document.getElementById("root") as HTMLElement;

if (hash.includes("browser-setting")) {
  ReactDOM.createRoot(root).render(<BrowserSetting />);
} else if (hash.includes("terminal")) {
  ReactDOM.createRoot(root).render(<Terminal />);
} else if (hash.includes("cookie-manager")) {
  ReactDOM.createRoot(root).render(<CookieManager />);
} else {
  ReactDOM.createRoot(root).render(<App />);
}
