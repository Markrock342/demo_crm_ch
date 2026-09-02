import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider.tsx";
import App from "./App.tsx";
import { CrmSync } from "./CrmSync.tsx";
import { StoreProvider } from "./store.tsx";
import "./index.css";
import "./ui/kit.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <StoreProvider>
        <CrmSync />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StoreProvider>
    </AuthProvider>
  </StrictMode>,
);
