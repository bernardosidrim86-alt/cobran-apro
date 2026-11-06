import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";
import "./landing-scroll-fix.css";
import "./app-refresh.css";
import "./landing.css";
import "./dashboard-polish.css";
import "./dark-mode.css";
import "./polish-v2.css";
import "./workspace-pages.css";
import "./auth-dark.css";
import "./push-notifications.css";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .catch(error => console.error("Falha ao registrar service worker:", error));
  });
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
