import type { CrmDoc, DocStatus } from "../crm";
import { customerName, type Customer } from "../data";
import type { Locale } from "../i18n";
import { t } from "../i18n";
import { Button } from "./Button";

type Props = {
  docs: CrmDoc[];
  customers: Customer[];
  locale: Locale;
  onOpenCustomer: (customerId: string) => void;
  onOpenBox: (boxId: string) => void;
  onStatusChange: (id: string, status: DocStatus) => void;
};

const docActions: DocStatus[] = ["ok", "wait", "late"];

export function DocLedgerCards({ docs, customers, locale, onOpenCustomer, onOpenBox, onStatusChange }: Props) {
  const tx = (key: string) => t(locale, key);

  return (
    <ul className="ledger-list" aria-label={tx("docsTitle")}>
      {docs.map((d) => {
        const c = customers.find((x) => x.id === d.customerId);
        const pill = d.status === "ok" ? "clear" : d.status === "late" ? "hold" : "yard";
        return (
          <li key={d.id}>
            <article className="ledger-row ledger-row--static">
              <div className="ledger-row-head">
                <span className="ledger-row-id">{d.name}</span>
                <span className={`pill pill-${pill}`}>{tx(`doc${cap(d.status)}`)}</span>
              </div>
              <p className="ledger-row-meta">
                <button type="button" className="ledger-link mono" onClick={() => onOpenBox(d.boxId)}>
                  {d.kind} · {d.boxId}
                </button>
              </p>
              <p className="ledger-row-meta">
                <button type="button" className="ledger-link" onClick={() => onOpenCustomer(d.customerId)}>
                  {c ? customerName(c, locale) : "—"}
                </button>
                <span aria-hidden>·</span>
                <span>{d.updated}</span>
              </p>
              <div className="ledger-row-foot">
                <div className="doc-actions">
                  {docActions.map((st) => (
                    <Button key={st} variant={d.status === st ? "primary" : "ghost"} onClick={() => onStatusChange(d.id, st)}>
                      {tx(`doc${cap(st)}`)}
                    </Button>
                  ))}
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
