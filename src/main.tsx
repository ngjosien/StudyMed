import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { loadSettings } from "./stores/ui";
import "@fontsource-variable/inter";
import "@fontsource-variable/eb-garamond";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/bodoni-moda";
import "@fontsource/libre-baskerville/400.css";
import "@fontsource/libre-baskerville/700.css";
import "@fontsource-variable/cormorant-garamond";
import "@fontsource/dm-serif-display";
import "@fontsource-variable/cinzel";
import "@fontsource-variable/source-serif-4";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false, staleTime: 5_000 } },
});

// Block the WebView's default context menu outside editable fields (feels native).
window.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement;
  if (!t.closest("input, textarea, [contenteditable]")) e.preventDefault();
});

loadSettings().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <App />
        </HashRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
});
