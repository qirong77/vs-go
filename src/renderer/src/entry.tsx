import ReactDOM from "react-dom/client";
import App from "./App";
import BrowserSetting from "./BrowserSetting";

const hash = window.location.hash;
const root = document.getElementById("root") as HTMLElement;

if (hash === "#/browser-setting") {
  ReactDOM.createRoot(root).render(<BrowserSetting />);
} else {
  ReactDOM.createRoot(root).render(<App />);
}
