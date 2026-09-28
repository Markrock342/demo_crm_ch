import { Badge, Dropdown } from "antd";
import {
  Bell,
  CaretDown,
  EnvelopeSimple,
  List,
  MagnifyingGlass,
  Plus,
  SidebarSimple,
  SignOut,
  Gear,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { aiHealth } from "../ai/client";
import { CommandPalette } from "../CommandPalette";
import { AppRoutes } from "../AppRoutes.tsx";
import { LangPicker } from "../ui/LangPicker";
import { useMedia } from "../ui/useMedia";
import { useShellNotifications } from "../shell/notificationStore.tsx";
import { useIsShellMode, useShellSession } from "../shell/session.tsx";
import { useStore } from "../store";
import { initialOf } from "./components/Visuals.tsx";
import { localizedUserName } from "./lib/demoText.ts";
import { activeNavItem, departmentFromRoles, v2NavForDepartment, v2NavPathAllowed } from "./navConfig.ts";
import "./shell.css";

const COLLAPSE_KEY = "cz.sidebar.collapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

export function V2AppShell() {
  const { tx, locale, setLocale, mails, toast } = useStore();
  const { user, logout } = useAuth();
  const orgName = user?.organizationName?.trim() || "";
  const { shellUser, leave } = useShellSession();
  const shellMode = useIsShellMode();
  const shellNotes = useShellNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const mobile = useMedia("(max-width: 1024px)");

  const dept = shellUser?.department ?? departmentFromRoles(user?.roles);
  const displayName = localizedUserName(shellUser ?? user, locale) || tx("userName");
  const displayRole = shellUser?.roles[0] ?? user?.roles[0] ?? tx("userRole");
  const unread = mails.filter((m) => m.unread && m.state === "open").length;
  const hot = shellMode ? shellNotes.unreadCount : 0;

  const [cmd, setCmd] = useState(false);
  const [gemini, setGemini] = useState<boolean | null>(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);

  const groups = useMemo(() => v2NavForDepartment(dept, tx), [dept, tx, locale]);
  const current = activeNavItem(groups, location.pathname);
  const narrow = collapsed && !mobile;

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

  useEffect(() => {
    setDrawer(false);
  }, [location.pathname]);

  useEffect(() => {
    document.title = current ? `${current.label} · ${tx("brand")}` : tx("brand");
  }, [current, tx]);

  function toggleCollapsed() {
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      } catch {
        /* storage unavailable — keep in memory */
      }
      return !v;
    });
  }

  function onLeave() {
    leave();
    if (user) void logout();
    navigate("/login", { replace: true });
  }

  const can = (path: string) => v2NavPathAllowed(dept, path);
  const createItems = [
    can("/quotations") && { key: "/quotations/new", label: tx("quickNewQuote") },
    can("/customers") && { key: "/customers?new=1", label: tx("quickNewCustomer") },
    can("/leads") && { key: "/leads?new=1", label: tx("quickNewLead") },
  ].filter(Boolean) as { key: string; label: string }[];

  const badgeFor = (path: string) => (path === "/inbox" ? unread : path === "/tasks" || path === "/notifications" ? hot : 0);

  const sidebar = (
    <aside className={`cz-side${narrow ? " is-narrow" : ""}${mobile ? " is-drawer" : ""}${drawer ? " is-open" : ""}`} aria-label={tx("mobileMenu")}>
      <div className="cz-side-head">
        <Link to="/" className="cz-brand" aria-label={tx("brand")}>
          <span className="cz-brand-mark" aria-hidden>
            栈
          </span>
          {!narrow ? (
            <span className="cz-brand-word">
              <strong>{tx("brand")}</strong>
              <em>{tx("brandRoman")}</em>
            </span>
          ) : null}
        </Link>
        {mobile ? (
          <button type="button" className="cz-icon-btn cz-side-close" onClick={() => setDrawer(false)} aria-label={tx("closeMenu")}>
            <X size={20} />
          </button>
        ) : null}
      </div>

      <nav className="cz-nav">
        {groups.map((g) => (
          <div key={g.key} className="cz-nav-group">
            {narrow ? <hr className="cz-nav-rule" /> : <p className="cz-nav-label">{g.label}</p>}
            <ul>
              {g.items.map((item) => {
                const count = badgeFor(item.path);
                const active = current?.path === item.path;
                return (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.end}
                      className={active ? "is-active" : undefined}
                      title={narrow ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                    >
                      <item.icon size={19} weight={active ? "fill" : "regular"} aria-hidden />
                      {!narrow ? <span className="cz-nav-text">{item.label}</span> : null}
                      {count > 0 ? <span className="cz-nav-count">{count > 99 ? "99+" : count}</span> : null}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="cz-side-foot">
        {!narrow ? (
          <div>
            {orgName ? <p className="cz-tenant">{orgName}</p> : null}
            <p className="cz-status">
              <span className={`cz-dot${gemini ? " is-on" : ""}`} aria-hidden />
              {gemini ? tx("geminiOn") : tx("geminiOff")}
            </p>
          </div>
        ) : (
          <span className={`cz-dot${gemini ? " is-on" : ""}`} title={gemini ? tx("geminiOn") : tx("geminiOff")} />
        )}
        {!mobile ? (
          <button type="button" className="cz-icon-btn cz-collapse" onClick={toggleCollapsed} aria-label={narrow ? tx("expandMenu") : tx("collapseMenu")} title={narrow ? tx("expandMenu") : tx("collapseMenu")}>
            <SidebarSimple size={18} />
          </button>
        ) : null}
      </div>
    </aside>
  );

  return (
    <div className={`cz-app${narrow ? " is-narrow" : ""}`}>
      <a className="skip" href="#main">
        {tx("skip")}
      </a>
      {sidebar}
      {mobile && drawer ? <button type="button" className="cz-scrim" aria-label={tx("closeMenu")} onClick={() => setDrawer(false)} /> : null}

      <div className="cz-main">
        <header className="cz-top">
          {mobile ? (
            <button type="button" className="cz-icon-btn" onClick={() => setDrawer(true)} aria-label={tx("openMenu")} aria-expanded={drawer}>
              <List size={22} />
            </button>
          ) : null}

          <button type="button" className="cz-search" onClick={() => setCmd(true)}>
            <MagnifyingGlass size={17} aria-hidden />
            <span className="cz-search-text">{mobile ? tx("searchShort") : tx("search")}</span>
            {!mobile ? <kbd>⌘K</kbd> : null}
          </button>

          <div className="cz-top-actions">
            {createItems.length ? (
              <Dropdown
                trigger={["click"]}
                placement="bottomRight"
                menu={{ items: createItems, onClick: ({ key }) => navigate(key) }}
              >
                <button type="button" className="cz-create">
                  <Plus size={16} weight="bold" aria-hidden />
                  {!mobile ? <span>{tx("quickCreate")}</span> : null}
                </button>
              </Dropdown>
            ) : null}

            <Link to="/notifications" className="cz-icon-btn" aria-label={tx("navNotifications")} title={tx("navNotifications")}>
              <Badge count={hot} size="small" offset={[2, -2]}>
                <Bell size={20} />
              </Badge>
            </Link>
            {can("/inbox") ? (
              <Link to="/inbox" className="cz-icon-btn" aria-label={tx("navInbox")} title={tx("navInbox")}>
                <Badge count={unread} size="small" offset={[2, -2]}>
                  <EnvelopeSimple size={20} />
                </Badge>
              </Link>
            ) : null}
            <LangPicker value={locale} onChange={setLocale} compact={mobile} />

            <Dropdown
              trigger={["click"]}
              placement="bottomRight"
              menu={{
                items: [
                  { key: "role", label: <span className="cz-menu-meta">{displayRole}</span>, disabled: true },
                  { type: "divider" },
                  { key: "settings", icon: <Gear size={16} />, label: tx("navSettings"), onClick: () => navigate("/settings") },
                  { key: "logout", icon: <SignOut size={16} />, label: tx("logout"), danger: true, onClick: onLeave },
                ],
              }}
            >
              <button type="button" className="cz-user" aria-label={tx("account")}>
                <span className="cz-avatar" aria-hidden>
                  {initialOf(displayName)}
                </span>
                {!mobile ? (
                  <>
                    <span className="cz-user-name">{displayName}</span>
                    <CaretDown size={12} aria-hidden />
                  </>
                ) : null}
              </button>
            </Dropdown>
          </div>
        </header>

        <main id="main" className="cz-content" key={location.pathname}>
          <AppRoutes />
        </main>
      </div>

      <CommandPalette open={cmd} onClose={() => setCmd(false)} />
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
