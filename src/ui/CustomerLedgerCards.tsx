import { cityName, customerName, laneName, type Customer } from "../data";
import type { Locale } from "../i18n";
import { t } from "../i18n";

type Props = {
  customers: Customer[];
  boxCounts: Record<string, number>;
  locale: Locale;
  onOpen: (customer: Customer) => void;
};

export function CustomerLedgerCards({ customers, boxCounts, locale, onOpen }: Props) {
  const tx = (key: string) => t(locale, key);

  return (
    <ul className="ledger-list" aria-label={tx("customersTitle")}>
      {customers.map((c) => (
        <li key={c.id}>
          <button type="button" className="ledger-row" onClick={() => onOpen(c)}>
            <div className="ledger-row-head">
              <span className="ledger-row-id">{customerName(c, locale)}</span>
              <span className="ledger-row-eta">{c.updated}</span>
            </div>
            <p className="ledger-row-meta">
              <span>{cityName(c, locale)}</span>
              <span aria-hidden>·</span>
              <span>{laneName(c, locale)}</span>
            </p>
            <div className="ledger-row-foot ledger-row-foot--spread">
              <span className="ledger-row-meta">
                {boxCounts[c.id] ?? 0} {tx("colBoxes")} · {c.owner}
              </span>
              {c.arDays >= 30 ? (
                <span className="pill pill-hold">
                  {tx("colAr")} {c.arDays}
                </span>
              ) : (
                <span className="ledger-row-nums">
                  {tx("colAr")} {c.arDays}
                </span>
              )}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
