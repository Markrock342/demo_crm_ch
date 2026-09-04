import {
  Bell,
  CalendarBlank,
  ChartBar,
  Cube,
  EnvelopeSimple,
  CurrencyCircleDollar,
  FileText,
  Funnel,
  Gear,
  House,
  IdentificationCard,
  List,
  ListChecks,
  MagnifyingGlass,
  Package,
  Receipt,
  SquaresFour,
  Tray,
  Users,
  X,
} from "@phosphor-icons/react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { aiHealth } from "./ai/client";
import { CommandPalette } from "./CommandPalette";
import { LangPicker } from "./ui/LangPicker";
import { MobileDock } from "./ui/MobileDock";
import { useMedia } from "./ui/useMedia";
import { LoginPage } from "./pages/Login";
import {
  PortalDocsPage,
  PortalEnterPage,
  PortalHomePage,
  PortalInvoicesPage,
  PortalJobPage,
} from "./pages/Portal";
import { QuotePublicPage } from "./pages/QuotePublic";
import { QuotePublicShellPage } from "./pages/QuotePublicShell";
import { navPathAllowed } from "./shell/nav.ts";
import { useShellNotifications } from "./shell/notificationStore.tsx";
import { useIsShellMode, useShellSession } from "./shell/session.tsx";
import { AppRoutes } from "./AppRoutes.tsx";
import { V2AppShell } from "./v2/AppShell.tsx";

import { useStore } from "./store";
import { uiV2 } from "./v2/config.ts";

const groups = [
  {
    key: "navSales",
    items: [
      { to: "/", key: "navOverview", icon: House, end: true },
      { to: "/exceptions", key: "navExceptions", icon: Bell },
      { to: "/pipeline", key: "navPipeline", icon: Funnel },
      { to: "/leads", key: "navLeads", icon: Tray },
      { to: "/customers", key: "navCustomers", icon: Users },
      { to: "/contacts", key: "navContacts", icon: IdentificationCard },
    ],
  },
  {
    key: "navCommercial",
    items: [
      { to: "/rates", key: "navRates", icon: CurrencyCircleDollar },
      { to: "/quotations", key: "navQuotations", icon: Receipt },
    ],
  },
  {
    key: "navFinance",
    items: [
      { to: "/jobs", key: "navJobs", icon: Package },
      { to: "/invoices", key: "navInvoices", icon: Receipt },
      { to: "/vendors", key: "navVendors", icon: Users },
      { to: "/vendor-bills", key: "navVendorBills", icon: Receipt },
    ],
  },
  {
    key: "navOps",
    items: [
      { to: "/boxes", key: "navBoxes", icon: Cube },
      { to: "/shipments", key: "navShipments", icon: Package },
      { to: "/yard", key: "navYard", icon: SquaresFour },
      { to: "/inbox", key: "navInbox", icon: EnvelopeSimple },
      { to: "/docs", key: "navDocs", icon: FileText },
      { to: "/exceptions", key: "navExceptions", icon: Bell },
      { to: "/notifications", key: "navNotifications", icon: Bell },
    ],
  },
  {
    key: "navWork",
    items: [
      { to: "/tasks", key: "navTasks", icon: ListChecks },
      { to: "/calendar", key: "navCalendar", icon: CalendarBlank },
      { to: "/reports", key: "navReports", icon: ChartBar },
      { to: "/automation", key: "navAutomation", icon: ListChecks },
      { to: "/settings", key: "navSettings", icon: Gear },
    ],
  },
] as const;

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
    <Routes>
      <Route path="/q/:token" element={<QuotePublicPage />} />
      <Route path="/q/shell/:id" element={<QuotePublicShellPage />} />
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
  );
}

function LegacyAppShell() {
  const s = useStore();
  const { tx, locale, setLocale, query, setQuery, mails, toast, compact, motion } = s;
  const { user, mode, logout } = useAuth();
  const { shellUser, leave } = useShellSession();
  const shellMode = useIsShellMode();
  const shellNotes = useShellNotifications();
  const navigate = useNavigate();
  const loc = useLocation();
  const dept = shellUser?.department ?? (user ? "admin" : null);
  const displayName = shellUser?.nameZh ?? shellUser?.name ?? user?.nameZh ?? user?.name ?? tx("userName");
  const displayRole = shellUser?.roles[0] ?? user?.roles[0] ?? tx("userRole");
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((l) => (dept ? navPathAllowed(dept, l.to) : false)),
    }))
    .filter((g) => g.items.length > 0);

  const unread = mails.filter((m) => m.unread && m.state === "open").length;
  const hot = shellMode ? shellNotes.unreadCount : 0;
  const [cmd, setCmd] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [gemini, setGemini] = useState<boolean | null>(null);
  const mobile = useMedia("(max-width: 1024px)");
  const narrowHeader = useMedia("(max-width: 1024px)");

  useEffect(() => {
    setMenuOpen(false);
  }, [loc.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  useEffect(() => {
    aiHealth()
      .then((h) => setGemini(h.ok))
      .catch(() => setGemini(false));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmd(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setCmd(true);
  }

  function onLeave() {
    leave();
    if (user) void logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className={`app${compact ? " is-dense" : ""}${motion ? "" : " is-still"}${mobile ? " is-mobile" : ""}${menuOpen ? " menu-open" : ""}`}>
      <a className="skip" href="#main">
        {tx("skip")}
      </a>

      <header className="app-bar">
        <button
          type="button"
          className="bar-menu"
          aria-label={menuOpen ? tx("closeMenu") : tx("openMenu")}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X size={22} weight="bold" /> : <List size={22} weight="bold" />}
        </button>

        <Link className="bar-brand" to="/" aria-label={tx("brand")} onClick={() => setMenuOpen(false)}>
          <span className="bar-mark" aria-hidden>
            栈
          </span>
          <span className="bar-word">
            <strong>{tx("brand")}</strong>
            <em>{tx("brandRoman")}</em>
          </span>
        </Link>

        {!narrowHeader ? (
          <form className="bar-search" onSubmit={onSearch}>
            <MagnifyingGlass size={18} weight="regular" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setCmd(true)}
              placeholder={`${tx("cmdHint")} ⌘K`}
              aria-label={tx("search")}
            />
          </form>
        ) : null}

        <div className="bar-actions">
          {narrowHeader ? (
            <button type="button" className="bar-search-btn" onClick={() => setCmd(true)} aria-label={tx("search")}>
              <MagnifyingGlass size={20} weight="bold" aria-hidden />
            </button>
          ) : null}
          {!narrowHeader ? (
            <button type="button" className="bar-bell" onClick={() => setNoteOpen((v) => !v)} aria-expanded={noteOpen}>
              <Bell size={18} weight="regular" aria-hidden className="bar-bell-icon" />
              <span className="bar-bell-text">{tx("notifyTitle")}</span>
              {hot > 0 ? <span className="badge badge-seal">{hot}</span> : null}
            </button>
          ) : null}
          <LangPicker value={locale} onChange={setLocale} compact={narrowHeader} />
          <Link className="bar-cta" to="/inbox" onClick={() => setMenuOpen(false)}>
            <EnvelopeSimple size={18} weight="fill" aria-hidden />
            <span className="bar-cta-text">{tx("headerCta")}</span>
            {unread > 0 ? <span className="badge badge-white">{unread}</span> : null}
          </Link>
          <div className="bar-user">
            <span className="bar-avatar" aria-hidden>
              {displayName.slice(0, 1)}
            </span>
            <span>
              <strong>{displayName}</strong>
              <em>{displayRole}</em>
            </span>
            {user || shellUser ? (
              <button type="button" className="btn btn-ghost btn-slim" onClick={onLeave}>
                {tx("logout")}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {noteOpen ? (
        <div className="notify-panel">
          {shellMode
            ? shellNotes.notifications.slice(0, 8).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="notify-row"
                  onClick={() => {
                    shellNotes.markRead(n.id);
                    navigate(n.href);
                    setNoteOpen(false);
                  }}
                >
                  {!n.read ? "• " : ""}
                  {n.title} — {n.body}
                </button>
              ))
            : null}
          <button
            type="button"
            className="notify-row"
            onClick={() => {
              navigate("/notifications");
              setNoteOpen(false);
            }}
          >
            {tx("navNotifications")} →
          </button>
        </div>
      ) : null}

      {menuOpen ? (
        <button type="button" className="side-backdrop" aria-label={tx("cancel")} onClick={() => setMenuOpen(false)} />
      ) : null}

      <div className="app-body">
        <aside className={`side${menuOpen ? " is-open" : ""}`} aria-hidden={mobile && !menuOpen}>
          {mobile ? (
            <div className="side-mobile-head">
              <strong>{tx("mobileMenu")}</strong>
              <button type="button" className="side-close" onClick={() => setMenuOpen(false)} aria-label={tx("closeMenu")}>
                <X size={20} weight="bold" />
              </button>
            </div>
          ) : null}
          {visibleGroups.map((g) => (
            <div key={g.key} className="nav-group">
              <p className="nav-label">{tx(g.key)}</p>
              <nav className="nav" aria-label={tx(g.key)}>
                {g.items.map((l) => (
                  <NavLink key={l.to} to={l.to} end={"end" in l ? l.end : false} onClick={() => setMenuOpen(false)}>
                    <l.icon size={18} weight="regular" aria-hidden />
                    {tx(l.key)}
                    {l.to === "/inbox" && unread > 0 ? <span className="badge badge-seal">{unread}</span> : null}
                    {l.to === "/tasks" && hot > 0 ? <span className="badge badge-seal">{hot}</span> : null}
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}
          <div className="side-foot">
            <p className="tenant">{tx("tenant")}</p>
            <p className={`gemini-dot ${gemini ? "on" : "off"}`}>{gemini ? tx("geminiOn") : tx("geminiOff")}</p>
            {shellUser ? <p className="meta">{tx("shellMode")}</p> : mode === "demo" ? <p className="meta">{tx("demoMode")}</p> : null}
          </div>
        </aside>

        <main id="main" className="content canvas" key={loc.pathname}>
          <AppRoutes />
        </main>
      </div>

      <CommandPalette open={cmd} onClose={() => setCmd(false)} />
      {mobile ? (
        <MobileDock unread={unread} openTasks={hot} onMenu={() => setMenuOpen(true)} />
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
