import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import App from "./App";

// Block Ctrl + Mouse Wheel
document.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
    }
  },
  { passive: false },
);

// Block Ctrl + Plus/Minus/Zero keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (
    e.ctrlKey &&
    (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0")
  ) {
    e.preventDefault();
  }
});

const container = document.getElementById("root");

const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
