import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider.tsx";
import App from "./App.tsx";
import { CrmSync } from "./CrmSync.tsx";
import { ShellBillingProvider } from "./shell/billingStore.tsx";
import { ShellCrmProvider } from "./shell/crmStore.tsx";
import { ShellJobProvider } from "./shell/jobStore.tsx";
import { ShellOpsProvider } from "./shell/opsStore.tsx";
import { ShellQuoteProvider } from "./shell/quoteStore.tsx";
import { ShellSessionProvider } from "./shell/session.tsx";
import { ShellSupportProvider } from "./shell/supportStore.tsx";
import { PortalSessionProvider } from "./shell/portalSession.tsx";
import { StoreProvider, initialLocale } from "./store.tsx";
import { loadPageLocale } from "./i18n-ui.ts";
import { ThemedApp } from "./v2/ThemedApp.tsx";
import "antd/dist/reset.css";
import "./index.css";
import "./ui/kit.css";

// Fetch the starting language's page strings before first paint (other languages load on switch).
const ready = loadPageLocale(initialLocale()).catch(() => undefined);

void ready.then(() => createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <ShellSessionProvider>
        <PortalSessionProvider>
          <ShellCrmProvider>
            <ShellOpsProvider>
              <ShellQuoteProvider>
                <ShellJobProvider>
                  <ShellBillingProvider>
                    <ShellSupportProvider>
                      <StoreProvider>
                        <CrmSync />
                        <BrowserRouter>
                          <ThemedApp>
                            <App />
                          </ThemedApp>
                        </BrowserRouter>
                      </StoreProvider>
                    </ShellSupportProvider>
                  </ShellBillingProvider>
                </ShellJobProvider>
              </ShellQuoteProvider>
            </ShellOpsProvider>
          </ShellCrmProvider>
        </PortalSessionProvider>
      </ShellSessionProvider>
    </AuthProvider>
  </StrictMode>,
));
