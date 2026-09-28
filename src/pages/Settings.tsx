import { Buildings, Monitor, PlugsConnected, Translate, UserCircle, UsersThree, type Icon } from "@phosphor-icons/react";
import { Segmented, Switch } from "antd";
import { useEffect, useState } from "react";
import { aiHealth } from "../ai/client";
import { useAuth } from "../auth/AuthProvider";
import { locales, type Locale } from "../i18n";
import { useStore } from "../store";
import { IconBadge, PageHeader, Panel, StatusTag, type GraphicTone } from "../v2/components";
import "../v2/pages/finance/finance.css";
import { AccountSection } from "./settings/AccountSection.tsx";
import { CompanySection } from "./settings/CompanySection.tsx";
import { UsersSection } from "./settings/UsersSection.tsx";
import { Row } from "./settings/shared.tsx";
import "./settings/settings.css";

type SectionId = "account" | "company" | "users" | "display" | "language" | "system";

function useConnections() {
  const [ai, setAi] = useState<boolean | null>(null);
  const [model, setModel] = useState("");
  const [db, setDb] = useState<boolean | null>(null);
  useEffect(() => {
    aiHealth()
      .then((h) => {
        setAi(h.ok);
        setModel(h.model ?? "");
      })
      .catch(() => setAi(false));
    fetch("/api/health")
      .then((r) => r.json() as Promise<{ database?: boolean }>)
      .then((h) => setDb(Boolean(h.database)))
      .catch(() => setDb(false));
  }, []);
  return { ai, model, db };
}

function Conn({ ok }: { ok: boolean | null }) {
  const { tx } = useStore();
  if (ok === null) return <StatusTag status="PENDING" label={tx("fin_setChecking")} />;
  return ok ? <StatusTag status="DONE" label={tx("fin_setConnected")} /> : <StatusTag status="OVERDUE" label={tx("fin_setNotConnected")} />;
}

export function SettingsPage() {
  const { tx, locale, setLocale, compact, setCompact, motion, setMotion } = useStore();
  const { user } = useAuth();
  const { ai, model, db } = useConnections();
  const [active, setActive] = useState<SectionId>("account");
  const isAdmin = Boolean(user && (user.roles.includes("SUPER_ADMIN") || user.permissions.includes("user.manage")));

  const sections: { id: SectionId; label: string; icon: Icon; tone: GraphicTone }[] = [
    { id: "account", label: tx("adm_secAccount"), icon: UserCircle, tone: "info" },
    { id: "company", label: tx("adm_secCompany"), icon: Buildings, tone: "primary" },
    { id: "users", label: tx("adm_secUsers"), icon: UsersThree, tone: "success" },
    { id: "display", label: tx("adm_secDisplay"), icon: Monitor, tone: "accent" },
    { id: "language", label: tx("adm_secLanguage"), icon: Translate, tone: "warning" },
    { id: "system", label: tx("adm_secSystem"), icon: PlugsConnected, tone: "neutral" },
  ];
  const visible = sections.filter((s) => s.id !== "users" || isAdmin);

  const head = (id: SectionId) => {
    const sec = sections.find((x) => x.id === id)!;
    return (
      <span className="fin-panel-title">
        <IconBadge icon={sec.icon} tone={sec.tone} size={30} />
        {sec.label}
      </span>
    );
  };

  function go(id: SectionId) {
    setActive(id);
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="cz-stack fin-page adm-page">
      <PageHeader title={tx("fin_setTitle")} subtitle={tx("adm_pageSub")} />

      <div className="fin-settings">
        <nav aria-label={tx("fin_setTitle")}>
          <ul className="fin-settings-nav">
            {visible.map((s) => (
              <li key={s.id}>
                <a
                  href={`#settings-${s.id}`}
                  className={active === s.id ? "is-active" : undefined}
                  aria-current={active === s.id ? "true" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    go(s.id);
                  }}
                >
                  <IconBadge icon={s.icon} tone={s.tone} size={30} />
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="cz-stack fin-settings-body">
          <div id="settings-account" className="adm-anchor">
            <Panel title={head("account")}>{user ? <AccountSection /> : null}</Panel>
          </div>

          <div id="settings-company" className="adm-anchor">
            <Panel title={head("company")}>{user ? <CompanySection canEdit={isAdmin} /> : null}</Panel>
          </div>

          {isAdmin ? (
            <div id="settings-users" className="adm-anchor">
              <Panel title={head("users")}>
                <UsersSection canManage={isAdmin} />
              </Panel>
            </div>
          ) : null}

          <div id="settings-display" className="adm-anchor">
            <Panel title={head("display")}>
              <Row label={tx("fin_setCompact")} hint={tx("fin_setCompactHint")}>
                <Switch checked={compact} onChange={setCompact} aria-label={tx("fin_setCompact")} />
              </Row>
              <Row label={tx("fin_setMotion")} hint={tx("fin_setMotionHint")}>
                <Switch checked={motion} onChange={setMotion} aria-label={tx("fin_setMotion")} />
              </Row>
            </Panel>
          </div>

          <div id="settings-language" className="adm-anchor">
            <Panel title={head("language")}>
              <Row label={tx("fin_setUiLanguage")} hint={tx("fin_setUiLanguageHint")}>
                <Segmented
                  value={locale}
                  onChange={(v) => setLocale(v as Locale)}
                  options={locales.map((l) => ({ value: l.id, label: l.id === "en" ? "English" : l.label }))}
                />
              </Row>
            </Panel>
          </div>

          <div id="settings-system" className="adm-anchor">
            <Panel title={head("system")}>
              <Row label={tx("fin_setAi")} hint={tx("fin_setAiHint")}>
                <Conn ok={ai} />
              </Row>
              <Row label={tx("fin_setModel")}>
                <span className="cz-mono">{model || "—"}</span>
              </Row>
              <Row label={tx("adm_database")}>
                <Conn ok={db} />
              </Row>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
