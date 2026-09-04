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
        <PageToolbar title={tx("navAutomation")} />
        <p className="empty">{tx("apiNotConfigured")}</p>
      </div>
    );
  }

  return (
    <div className="page page--workspace page--automation">
      <PageToolbar
        title={tx("navAutomation")}
        hint={tx("shellDataBadge")}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => auto.runRules()}>
            {tx("runAutomation")}
          </button>
        }
      />

      <div className="stat-strip">
        <span className="stat-chip">
          <strong className="num">{auto.rules.filter((r) => r.enabled).length}</strong>
          <span>{tx("automationOn")}</span>
        </span>
        <span className="stat-chip">
          <strong className="num">{auto.rules.length}</strong>
          <span>{tx("automationRules")}</span>
        </span>
        <span className="stat-chip">
          <strong className="num">{auto.auditLog.length}</strong>
          <span>{tx("automationAudit")}</span>
        </span>
      </div>

      <section className="block">
        <div className="block-head">
          <h2>{tx("automationRules")}</h2>
        </div>
        <ul className="dense-list">
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

      <section className="block">
        <div className="block-head">
          <h2>{tx("automationAudit")}</h2>
        </div>
        {auto.auditLog.length === 0 ? (
          <p className="empty">{tx("emptyShellCrm")}</p>
        ) : (
          <ul className="dense-list">
            {auto.auditLog.slice(0, 40).map((a) => (
              <li key={a.id}>
                <span>
                  <span className="mono meta">{a.at.slice(0, 19)}</span> · {a.ruleName} — {a.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
