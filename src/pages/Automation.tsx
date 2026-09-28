import { ArrowRight, BellRinging, ChatCircleText, Lightning } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { App, Button, Switch, Tooltip } from "antd";
import { runAutomationNow, updateAutomationRule, type AutomationRule, type RuleKey } from "../api/notifications.ts";
import type { Locale } from "../i18n";
import { useStore } from "../store";
import { CardGrid, EmptyState, ErrorState, IconBadge, LoadingState, PageHeader, Panel } from "../v2/components";
import { useCan } from "../v2/hooks/useCan.ts";
import { automationRulesKey, notificationsKey, useAutomationRules } from "../v2/hooks/useNotifications.ts";
import { fmtDateTime } from "../v2/lib/format.ts";
import { RULE_LOOK, RULE_ORDER } from "./notifyLook.ts";
import "../v2/pages/finance/finance.css";
import "./notify.css";

export function AutomationPage() {
  const { tx, locale } = useStore();
  const loc = locale as Locale;
  const { message } = App.useApp();
  const can = useCan();
  const isAdmin = can("user.manage");
  const qc = useQueryClient();
  const rules = useAutomationRules();

  const setRules = (items: AutomationRule[]) =>
    qc.setQueryData<{ items: AutomationRule[]; lineAvailable: boolean }>(automationRulesKey, (old) => (old ? { ...old, items } : old));

  const toggle = useMutation({
    mutationFn: ({ key, patch }: { key: RuleKey; patch: { enabled?: boolean; channels?: string[] } }) => updateAutomationRule(key, patch),
    onMutate: ({ key, patch }) => {
      const cur = rules.data?.items ?? [];
      setRules(cur.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    },
    onSuccess: (rule) => {
      const cur = rules.data?.items ?? [];
      if (cur.some((r) => r.key === rule.key)) setRules(cur.map((r) => (r.key === rule.key ? rule : r)));
      else void qc.invalidateQueries({ queryKey: automationRulesKey });
      message.success(tx("nt_saved"));
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: automationRulesKey });
      message.error(tx("nt_error"));
    },
  });

  const run = useMutation({
    mutationFn: runAutomationNow,
    onSuccess: ({ result, items }) => {
      setRules(items);
      void qc.invalidateQueries({ queryKey: notificationsKey });
      if (result.created) message.success(tx("nt_runDone", { n: result.created }));
      else message.info(tx("nt_runNothing"));
    },
    onError: () => message.error(tx("nt_error")),
  });

  const list = [...(rules.data?.items ?? [])].sort((a, b) => RULE_ORDER.indexOf(a.key) - RULE_ORDER.indexOf(b.key));
  const on = list.filter((r) => r.enabled).length;
  const lineAvailable = Boolean(rules.data?.lineAvailable);
  const lastRun =
    list
      .map((r) => r.lastRunAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  return (
    <div className="cz-stack fin-page">
      <PageHeader
        title={tx("fin_autoTitle")}
        subtitle={
          rules.data
            ? `${tx("fin_autoSub", { on, total: list.length })} · ${lastRun ? tx("fin_lastFired", { when: fmtDateTime(lastRun, loc) }) : tx("nt_every")}`
            : undefined
        }
        extra={
          isAdmin ? (
            <Button type="primary" icon={<Lightning size={16} weight="fill" />} loading={run.isPending} onClick={() => run.mutate()}>
              {tx("fin_runNow")}
            </Button>
          ) : null
        }
      />

      {rules.isLoading ? (
        <LoadingState />
      ) : rules.error ? (
        <ErrorState title={tx("nt_error")} />
      ) : !list.length ? (
        <Panel>
          <EmptyState
            title={tx("nt_noRulesTitle")}
            description={tx("nt_noRulesDesc")}
            action={
              isAdmin ? (
                <Button
                  type="primary"
                  loading={toggle.isPending}
                  onClick={() => toggle.mutate({ key: "eta_changed", patch: { enabled: true } })}
                >
                  {tx("nt_noRulesAction")}
                </Button>
              ) : undefined
            }
          />
        </Panel>
      ) : (
        <CardGrid min={320}>
          {list.map((r) => {
            const look = RULE_LOOK[r.key];
            const trigger = tx(`nt_rule_${r.key}_trigger`);
            const line = r.channels.includes("line");
            return (
              <article key={r.key} className={`fin-rule-card${r.enabled ? " is-on" : " is-off"}`} aria-label={trigger}>
                <div className="fin-flow">
                  <div className="fin-flow-step">
                    <span className="fin-flow-eyebrow">{tx("fin_ruleWhen")}</span>
                    <IconBadge icon={look.icon} tone={look.tone} size={56} />
                    <span className="fin-flow-label">{trigger}</span>
                  </div>
                  <ArrowRight size={28} weight="bold" className="fin-flow-arrow" aria-hidden />
                  <div className="fin-flow-step">
                    <span className="fin-flow-eyebrow">{tx("fin_ruleThenLabel")}</span>
                    <span className="nt-then-icons">
                      <IconBadge icon={BellRinging} tone="primary" size={56} />
                      {lineAvailable && line ? (
                        <Tooltip title={tx("nt_channelLine")}>
                          <span className="nt-line-mini" aria-label={tx("nt_channelLine")}>
                            <ChatCircleText size={16} weight="fill" />
                          </span>
                        </Tooltip>
                      ) : null}
                    </span>
                    <span className="fin-flow-label">{tx(`nt_rule_${r.key}_action`)}</span>
                  </div>
                </div>
                <div className="fin-rule-foot">
                  <span className="nt-rule-last">
                    {r.lastRunAt ? (
                      <>
                        <time dateTime={r.lastRunAt}>{fmtDateTime(r.lastRunAt, loc)}</time>
                        {r.lastResult ? (
                          <span className={`nt-rule-result${r.lastResult.matched ? " is-hot" : ""}`}>
                            {tx("nt_lastResult", { matched: r.lastResult.matched, created: r.lastResult.created })}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      tx("fin_neverFired")
                    )}
                  </span>
                  <Tooltip title={isAdmin ? undefined : tx("nt_adminOnly")}>
                    <label className={`fin-switch-wrap${r.enabled ? " is-on" : ""}`}>
                      {r.enabled ? tx("fin_on") : tx("fin_off")}
                      <Switch
                        checked={r.enabled}
                        disabled={!isAdmin}
                        onChange={(v) => toggle.mutate({ key: r.key, patch: { enabled: v } })}
                        aria-label={trigger}
                      />
                    </label>
                  </Tooltip>
                </div>
                {lineAvailable && isAdmin ? (
                  <label className="nt-rule-line">
                    <ChatCircleText size={16} aria-hidden />
                    <span>{tx("nt_sendLine")}</span>
                    <Switch
                      size="small"
                      checked={line}
                      disabled={!r.enabled}
                      onChange={(v) => toggle.mutate({ key: r.key, patch: { channels: v ? ["in_app", "line"] : ["in_app"] } })}
                      aria-label={`${trigger} · ${tx("nt_sendLine")}`}
                    />
                  </label>
                ) : null}
              </article>
            );
          })}
        </CardGrid>
      )}
    </div>
  );
}
