import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { useShellSession } from "./shell/session.tsx";
import { useStore } from "./store";
import { uiV2 } from "./v2/config.ts";
import { LoadingState } from "./v2/components/LoadingState.tsx";

// Code splitting: the login screen, the public/portal pages and the signed-in shells each load on demand.
const LoginPage = lazy(() => import("./pages/Login").then((m) => ({ default: m.LoginPage })));
const PortalEnterPage = lazy(() => import("./pages/Portal").then((m) => ({ default: m.PortalEnterPage })));
const PortalHomePage = lazy(() => import("./pages/Portal").then((m) => ({ default: m.PortalHomePage })));
const PortalJobPage = lazy(() => import("./pages/Portal").then((m) => ({ default: m.PortalJobPage })));
const PortalDocsPage = lazy(() => import("./pages/Portal").then((m) => ({ default: m.PortalDocsPage })));
const PortalInvoicesPage = lazy(() => import("./pages/Portal").then((m) => ({ default: m.PortalInvoicesPage })));
const QuotePublicPage = lazy(() => import("./pages/QuotePublic").then((m) => ({ default: m.QuotePublicPage })));
const V2AppShell = lazy(() => import("./v2/AppShell.tsx").then((m) => ({ default: m.V2AppShell })));
const LegacyAppShell = lazy(() => import("./LegacyAppShell.tsx").then((m) => ({ default: m.LegacyAppShell })));

export default function App() {
  const { user, loading } = useAuth();
  const { shellUser } = useShellSession();
  const { tx } = useStore();
  const loc = useLocation();
  const signedIn = Boolean(user || shellUser);

  if (loading) {
    return (
      <div className="login-page">
        <p className="meta">{tx("loading")}</p>
      </div>
    );
  }

  return (
    <Suspense fallback={<LoadingState />}>
    <Routes>
      <Route path="/q/:token" element={<QuotePublicPage />} />
      <Route path="/portal" element={<PortalEnterPage />} />
      <Route path="/portal/home" element={<PortalHomePage />} />
      <Route path="/portal/jobs/:id" element={<PortalJobPage />} />
      <Route path="/portal/docs" element={<PortalDocsPage />} />
      <Route path="/portal/invoices" element={<PortalInvoicesPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          !signedIn && !loc.pathname.startsWith("/portal") && loc.pathname !== "/login" ? (
            <Navigate to="/login" replace />
          ) : uiV2 ? (
            <V2AppShell />
          ) : (
            <LegacyAppShell />
          )
        }
      />
    </Routes>
    </Suspense>
  );
}
