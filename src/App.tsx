import {
  Bell,
  CalendarBlank,
  ChartBar,
  Cube,
  EnvelopeSimple,
  FileText,
  Funnel,
  Gear,
  House,
  IdentificationCard,
  List,
  ListChecks,
  MagnifyingGlass,
  Package,
  SquaresFour,
  Tray,
  Users,
  X,
} from "@phosphor-icons/react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { aiHealth } from "./ai/client";
import { CommandPalette } from "./CommandPalette";
import { LangPicker } from "./ui/LangPicker";
import { MobileDock } from "./ui/MobileDock";
import { useMedia } from "./ui/useMedia";
import { AccountPage } from "./pages/Account";
import { BoxesPage } from "./pages/Boxes";
import { CalendarPage } from "./pages/Calendar";
import { ContactsPage } from "./pages/Contacts";
import { CustomersPage } from "./pages/Customers";
import { DocsPage } from "./pages/Docs";
import { InboxPage } from "./pages/Inbox";
import { LeadsPage } from "./pages/Leads";
import { OverviewPage } from "./pages/Overview";
import { PipelinePage } from "./pages/Pipeline";
import { ReportsPage } from "./pages/Reports";
import { SettingsPage } from "./pages/Settings";
import { ShipmentsPage } from "./pages/Shipments";
import { TasksPage } from "./pages/Tasks";
import { YardPage } from "./pages/Yard";
import { useStore } from "./store";

const groups = [
  {
    key: "navSales",
    items: [
      { to: "/", key: "navOverview", icon: House, end: true },
      { to: "/pipeline", key: "navPipeline", icon: Funnel },
      { to: "/leads", key: "navLeads", icon: Tray },
      { to: "/customers", key: "navCustomers", icon: Users },
      { to: "/contacts", key: "navContacts", icon: IdentificationCard },
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
    ],
  },
  {
    key: "navWork",
    items: [
      { to: "/tasks", key: "navTasks", icon: ListChecks },
      { to: "/calendar", key: "navCalendar", icon: CalendarBlank },
      { to: "/reports", key: "navReports", icon: ChartBar },
      { to: "/settings", key: "navSettings", icon: Gear },
    ],
  },
] as const;

export default function App() {
  const s = useStore();
  const { tx, locale, setLocale, query, setQuery, mails, tasks, docs, toast, compact, motion } = s;
  const navigate = useNavigate();
  const loc = useLocation();
  const unread = mails.filter((m) => m.unread && m.state === "open").length;
  const hot = tasks.filter((t) => !t.done && t.priority === "high").length + docs.filter((d) => d.status !== "ok").length;
  const openTasks = tasks.filter((t) => !t.done).length;
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
          <button type="button" className="bar-bell" onClick={() => setNoteOpen((v) => !v)} aria-expanded={noteOpen}>
            <Bell size={18} weight="regular" aria-hidden className="bar-bell-icon" />
            <span className="bar-bell-text">{tx("notifyTitle")}</span>
            {hot > 0 ? <span className="badge badge-seal">{hot}</span> : null}
          </button>
          <LangPicker value={locale} onChange={setLocale} />
          <Link className="bar-cta" to="/inbox" onClick={() => setMenuOpen(false)}>
            <EnvelopeSimple size={18} weight="fill" aria-hidden />
            <span className="bar-cta-text">{tx("headerCta")}</span>
            {unread > 0 ? <span className="badge badge-white">{unread}</span> : null}
          </Link>
          <div className="bar-user">
            <span className="bar-avatar" aria-hidden>
              林
            </span>
            <span>
              <strong>{tx("userName")}</strong>
              <em>{tx("userRole")}</em>
            </span>
          </div>
        </div>
      </header>

      {noteOpen ? (
        <div className="notify-panel">
          {s.tasks
            .filter((t) => !t.done)
            .slice(0, 6)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                className="notify-row"
                onClick={() => {
                  navigate("/tasks");
                  setNoteOpen(false);
                }}
              >
                {t.title}
              </button>
            ))}
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
          {groups.map((g) => (
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
          </div>
        </aside>

        <main id="main" className="content canvas" key={loc.pathname}>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/:id" element={<AccountPage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/boxes" element={<BoxesPage />} />
            <Route path="/shipments" element={<ShipmentsPage />} />
            <Route path="/yard" element={<YardPage />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <CommandPalette open={cmd} onClose={() => setCmd(false)} />
      {mobile ? (
        <MobileDock unread={unread} openTasks={openTasks} onMenu={() => setMenuOpen(true)} />
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
