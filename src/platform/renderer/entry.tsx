import ReactDOM from "react-dom/client";
import { resolveRouteComponent } from "./routes";

const RootComponent = resolveRouteComponent(window.location.hash);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<RootComponent />);
