import { ArrowRight, Bell, BellRinging, CalendarX, FileX, Lightning, Receipt, UsersThree, type Icon } from "@phosphor-icons/react";
import { App, Button, Switch } from "antd";
import { useState } from "react";
import { useIsShellMode } from "../shell/session.tsx";
import { useShellAutomation, type AutomationAudit, type AutomationRule } from "../shell/automationStore.tsx";
import { useStore } from "../store";
import { CardGrid, IconBadge, PageHeader, Panel } from "../v2/components";
import { fmtDateTime } from "../v2/lib/format.ts";
import "../v2/pages/finance/finance.css";

const RULE_ICON: Record<AutomationRule["event"], Icon> = {
  missing_doc: FileX,
  eta_changed: CalendarX,
  invoice_overdue: Receipt,
};

const ACTION_ICON: Record<AutomationRule["event"], Icon> = {
  missing_doc: UsersThree,
  eta_changed: Bell,
  invoice_overdue: BellRinging,
};

const TRIGGER_TONE: Record<AutomationRule["event"], "warning" | "info" | "danger"> = {
  missing_doc: "warning",
  eta_changed: "info",
  invoice_overdue: "danger",
};

const EVENT_BY_RULE: Record<string, AutomationRule["event"]> = {
  "rule-missing-doc": "missing_doc",
  "rule-eta": "eta_changed",
  "rule-ar": "invoice_overdue",
};

export function AutomationPage() {
  const shell = useIsShellMode();
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const auto = useShellAutomation();
  const [showAll, setShowAll] = useState(false);

  const on = auto.rules.filter((r) => r.enabled).length;
  const lastRun = (id: string) => auto.auditLog.find((a) => a.ruleId === id && a.detail.includes("="));

  /** "docs=2 boxes=1" → "เอกสาร 2 · ตู้ 1"; "enabled" → "เปิดกฎ" */
  function describe(a: AutomationAudit) {
    if (a.detail === "enabled") return tx("fin_logEnabled");
    if (a.detail === "disabled") return tx("fin_logDisabled");
    const parts = a.detail
      .split(/\s+/)
      .map((kv) => kv.split("="))
      .filter(([k, v]) => k && v && v !== "0")
      .map(([k, v]) => tx(`fin_logCount_${k}`, { n: v! }));
    return parts.length ? tx("fin_logFound", { what: parts.join(" · ") }) : a.detail;
  }

  function ruleTrigger(event: AutomationRule["event"] | undefined) {
    return event ? tx(`fin_rule_${event}_trigger`) : "";
  }

  function run() {
    const n = auto.runRules();
    if (n) message.success(tx("fin_ranRules", { n }));
    else message.info(tx("fin_ranNothing"));
  }

  return (
    <div className="cz-stack fin-page">
      <PageHeader
        title={tx("fin_autoTitle")}
        subtitle={tx("fin_autoSub", { on, total: auto.rules.length })}
        extra={
          shell ? (
            <Button type="primary" onClick={run}>
              {tx("fin_runNow")}
            </Button>
          ) : null
        }
      />

      <CardGrid min={340}>
        {auto.rules.map((r) => {
          const Trig = RULE_ICON[r.event] ?? Lightning;
          const Act = ACTION_ICON[r.event] ?? Bell;
          const last = lastRun(r.id);
          return (
            <article key={r.id} className={`fin-rule-card${r.enabled ? " is-on" : " is-off"}`} aria-label={ruleTrigger(r.event)}>
              <div className="fin-flow">
                <div className="fin-flow-step">
                  <span className="fin-flow-eyebrow">{tx("fin_ruleWhen")}</span>
                  <IconBadge icon={Trig} tone={TRIGGER_TONE[r.event] ?? "warning"} size={56} />
                  <span className="fin-flow-label">{ruleTrigger(r.event)}</span>
                </div>
                <ArrowRight size={28} weight="bold" className="fin-flow-arrow" aria-hidden />
                <div className="fin-flow-step">
                  <span className="fin-flow-eyebrow">{tx("fin_ruleThenLabel")}</span>
                  <IconBadge icon={Act} tone="primary" size={56} />
                  <span className="fin-flow-label">{tx(`fin_rule_${r.event}_action`)}</span>
                </div>
              </div>
              <div className="fin-rule-foot">
                <span>{last ? tx("fin_lastFired", { when: fmtDateTime(last.at, locale) }) : tx("fin_neverFired")}</span>
                <label className={`fin-switch-wrap${r.enabled ? " is-on" : ""}`}>
                  {r.enabled ? tx("fin_on") : tx("fin_off")}
                  <Switch checked={r.enabled} onChange={(v) => auto.setRuleEnabled(r.id, v)} aria-label={ruleTrigger(r.event)} />
                </label>
              </div>
            </article>
          );
        })}
      </CardGrid>

      {auto.auditLog.length ? (
        <Panel
          title={tx("fin_logTitle")}
          flush
          extra={
            auto.auditLog.length > 6 ? (
              <button type="button" className="cz-link-btn" onClick={() => setShowAll((v) => !v)}>
                {showAll ? tx("fin_showLess") : tx("fin_showAll", { n: Math.min(auto.auditLog.length, 40) })}
              </button>
            ) : null
          }
        >
          <ul className="fin-log">
            {auto.auditLog.slice(0, showAll ? 40 : 6).map((a) => {
              const ev = EVENT_BY_RULE[a.ruleId];
              const Ico = ev ? RULE_ICON[ev] : Lightning;
              return (
                <li key={a.id}>
                  <time dateTime={a.at}>{fmtDateTime(a.at, locale)}</time>
                  <span className="fin-log-icon">
                    <IconBadge icon={Ico} tone={ev ? TRIGGER_TONE[ev] : "neutral"} size={28} />
                    <span>
                      {ruleTrigger(ev) || a.ruleName}
                      <span className="cz-cell-sub">{describe(a)}</span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : (
        <p className="fin-hint-line">{tx("fin_logEmpty")}</p>
      )}
    </div>
  );
}
