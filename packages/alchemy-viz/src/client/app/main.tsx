import { createRoot } from "react-dom/client";
import "../../ui/styles.css";
import "./shell.css";
import { App } from "./app.tsx";

createRoot(document.getElementById("root")!).render(<App />);
