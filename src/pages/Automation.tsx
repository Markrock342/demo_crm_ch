import { useIsShellMode } from "../shell/session.tsx";
import { useShellAutomation } from "../shell/automationStore.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

export function AutomationPage() {
  const shell = useIsShellMode();
  const { tx } = useStore();
  const auto = useShellAutomation();

  if (!shell) {
    return (
      <div className="page page--workspace">
        <PageToolbar title={tx("navAutomation")} hint={tx("apiNotConfigured")} />
        <p className="meta">{tx("apiNotConfigured")}</p>
      </div>
    );
  }

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("navAutomation")}
        hint={tx("shellDataBadge")}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => auto.runRules()}>
            {tx("runAutomation")}
          </button>
        }
      />
      <section className="panel">
        <h2>{tx("automationRules")}</h2>
        <ul className="list-plain">
          {auto.rules.map((r) => (
            <li key={r.id} className="row-between">
              <span>
                {r.name} <span className="meta">({r.event})</span>
              </span>
              <label className="meta">
                <input type="checkbox" checked={r.enabled} onChange={(e) => auto.setRuleEnabled(r.id, e.target.checked)} />{" "}
                {r.enabled ? tx("automationOn") : tx("automationOff")}
              </label>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2>{tx("automationAudit")}</h2>
        {auto.auditLog.length === 0 ? <p className="empty">{tx("emptyShellCrm")}</p> : null}
        <ul className="list-plain">
          {auto.auditLog.slice(0, 40).map((a) => (
            <li key={a.id}>
              <span className="mono meta">{a.at.slice(0, 19)}</span> · {a.ruleName} — {a.detail}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
