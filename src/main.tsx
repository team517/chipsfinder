import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./panel/panel.css";
import Root from "./Root";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
