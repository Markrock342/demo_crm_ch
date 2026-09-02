import { leadStageI18n, leadStages, type Lead, type LeadStage } from "../crm";
import type { Locale } from "../i18n";
import { t } from "../i18n";

type Props = {
  leads: Lead[];
  locale: Locale;
  onStageChange: (id: string, stage: LeadStage) => void;
  onConvert: (id: string) => void;
};

export function LeadLedgerCards({ leads, locale, onStageChange, onConvert }: Props) {
  const tx = (key: string) => t(locale, key);

  return (
    <ul className="ledger-list" aria-label={tx("leadsTitle")}>
      {leads.map((l) => (
        <li key={l.id}>
          <article className="ledger-row ledger-row--static">
            <div className="ledger-row-head">
              <span className="ledger-row-id">{l.company}</span>
              <span className="ledger-row-nums">{l.teu} TEU</span>
            </div>
            <p className="ledger-row-meta">
              <span>{l.city}</span>
              <span aria-hidden>·</span>
              <span>{l.lane}</span>
            </p>
            <p className="ledger-row-meta">
              <span>{l.contact}</span>
              <span aria-hidden>·</span>
              <span>{l.source}</span>
              <span aria-hidden>·</span>
              <span>{l.owner}</span>
            </p>
            <div className="ledger-row-foot">
              <label className="ledger-row-status">
                <span className="sr-only">{tx("colStage")}</span>
                <select
                  className="status-select"
                  value={l.stage}
                  onChange={(e) => onStageChange(l.id, e.target.value as LeadStage)}
                >
                  {leadStages.map((s) => (
                    <option key={s} value={s}>
                      {tx(leadStageI18n[s])}
                    </option>
                  ))}
                </select>
              </label>
              {l.stage !== "lost" ? (
                <button type="button" className="btn btn-ghost btn-slim" onClick={() => onConvert(l.id)}>
                  {tx("convertLead")}
                </button>
              ) : (
                <span className="pill pill-empty">{tx(leadStageI18n[l.stage])}</span>
              )}
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
