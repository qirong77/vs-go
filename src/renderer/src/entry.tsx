import ReactDOM from "react-dom/client";
import App from "./App";
import AppSetting from "./AppSetting";
import BrowserSetting from "./BrowserSetting";
import CookieManager from "./CookieManager";
import UserNotes from "./UserNotes";

const hash = window.location.hash;
const root = document.getElementById("root") as HTMLElement;

if (hash.includes("browser-setting")) {
  ReactDOM.createRoot(root).render(<BrowserSetting />);
} else if (hash.includes("cookie-manager")) {
  ReactDOM.createRoot(root).render(<CookieManager />);
} else if (hash.includes("user-notes")) {
  ReactDOM.createRoot(root).render(<UserNotes />);
} else if (hash.includes("app-setting")) {
  ReactDOM.createRoot(root).render(<AppSetting />);
} else {
  ReactDOM.createRoot(root).render(<App />);
}
