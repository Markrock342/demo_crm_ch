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
import { ShellNotificationProvider } from "./shell/notificationStore.tsx";
import { PortalSessionProvider } from "./shell/portalSession.tsx";
import { StoreProvider } from "./store.tsx";
import "./index.css";
import "./ui/kit.css";

createRoot(document.getElementById("root")!).render(
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
                      <ShellNotificationProvider>
                        <StoreProvider>
                          <CrmSync />
                          <BrowserRouter>
                            <App />
                          </BrowserRouter>
                        </StoreProvider>
                      </ShellNotificationProvider>
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
);
