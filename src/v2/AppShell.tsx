import { ProLayout } from "@ant-design/pro-components";
import { Badge, Button, Dropdown, Input, Space, Typography } from "antd";
import { Bell, EnvelopeSimple, MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { aiHealth } from "../ai/client";
import { CommandPalette } from "../CommandPalette";
import { AppRoutes } from "../AppRoutes.tsx";
import { LangPicker } from "../ui/LangPicker";
import { useShellNotifications } from "../shell/notificationStore.tsx";
import { useIsShellMode, useShellSession } from "../shell/session.tsx";
import { useStore } from "../store";
import { v2NavForDepartment } from "./navConfig.ts";

export function V2AppShell() {
  const s = useStore();
  const { tx, locale, setLocale, query, setQuery, mails, toast } = s;
  const { user, mode, logout } = useAuth();
  const { shellUser, leave } = useShellSession();
  const shellMode = useIsShellMode();
  const shellNotes = useShellNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const dept = shellUser?.department ?? (user ? "admin" : null);
  const displayName = shellUser?.nameZh ?? shellUser?.name ?? user?.nameZh ?? user?.name ?? tx("userName");
  const displayRole = shellUser?.roles[0] ?? user?.roles[0] ?? tx("userRole");
  const unread = mails.filter((m) => m.unread && m.state === "open").length;
  const hot = shellMode ? shellNotes.unreadCount : 0;
  const [cmd, setCmd] = useState(false);
  const [gemini, setGemini] = useState<boolean | null>(null);

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

  const menuRoutes = useMemo(
    () => v2NavForDepartment(dept, tx),
    [dept, tx, locale],
  );

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
    <>
      <ProLayout
        title={tx("brand")}
        logo={
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 18 }} aria-hidden>
            栈
          </span>
        }
        layout="mix"
        fixSiderbar
        siderWidth={220}
        contentWidth="Fluid"
        location={{ pathname: location.pathname }}
        route={{ routes: menuRoutes }}
        menuItemRender={(item, dom) => {
          if (!item.path) return dom;
          return (
            <Link to={item.path} onClick={() => undefined}>
              {dom}
            </Link>
          );
        }}
        subMenuItemRender={(item, dom) => {
          if (!item.path) return dom;
          return <Link to={item.path}>{dom}</Link>;
        }}
        actionsRender={() => [
          <form key="search" onSubmit={onSearch} style={{ width: 220 }}>
            <Input
              prefix={<MagnifyingGlass size={16} />}
              placeholder={`${tx("cmdHint")} ⌘K`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setCmd(true)}
              allowClear
              size="small"
            />
          </form>,
          <Button
            key="notify"
            type="text"
            icon={<Bell size={18} />}
            onClick={() => navigate("/notifications")}
          >
            {hot > 0 ? <Badge count={hot} size="small" /> : null}
          </Button>,
          <Link key="inbox" to="/inbox">
            <Button type="text" icon={<EnvelopeSimple size={18} weight="fill" />}>
              {unread > 0 ? <Badge count={unread} size="small" /> : null}
            </Button>
          </Link>,
          <LangPicker key="lang" value={locale} onChange={setLocale} compact />,
        ]}
        avatarProps={{
          title: displayName,
          render: (_, dom) => (
            <Dropdown
              menu={{
                items: [
                  { key: "role", label: displayRole, disabled: true },
                  { type: "divider" },
                  { key: "settings", label: tx("navSettings"), onClick: () => navigate("/settings") },
                  { key: "logout", label: tx("logout"), onClick: onLeave },
                ],
              }}
            >
              {dom}
            </Dropdown>
          ),
        }}
        footerRender={() => (
          <div style={{ padding: "8px 16px", fontSize: 12, color: "#888" }}>
            <Typography.Text type="secondary">{tx("tenant")}</Typography.Text>
            <Space size="middle" style={{ marginLeft: 12 }}>
              <Link to="/" style={{ color: "inherit" }}>
                <span className={`gemini-dot ${gemini ? "on" : "off"}`}>✦ {gemini ? tx("geminiOn") : tx("geminiOff")}</span>
              </Link>
              {shellUser ? <span>{tx("shellMode")}</span> : mode === "demo" ? <span>{tx("demoMode")}</span> : null}
            </Space>
          </div>
        )}
      >
        <div id="main" style={{ minHeight: "calc(100vh - 120px)" }}>
          <AppRoutes />
        </div>
      </ProLayout>

      <CommandPalette open={cmd} onClose={() => setCmd(false)} />
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}
