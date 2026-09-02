import { Link } from "react-router-dom";
import { customerName } from "../data";
import type { Locale } from "../i18n";
import { t } from "../i18n";
import { shipmentStatusI18n, type Shipment } from "../logistics";
import type { Customer } from "../data";

type Props = {
  shipments: Shipment[];
  customers: Customer[];
  locale: Locale;
  boxCounts: Record<string, number>;
};

export function ShipmentLedgerCards({ shipments, customers, locale, boxCounts }: Props) {
  const tx = (key: string) => t(locale, key);

  return (
    <ul className="ledger-list" aria-label={tx("shipmentsTitle")}>
      {shipments.map((s) => {
        const c = customers.find((x) => x.id === s.customerId);
        return (
          <li key={s.id}>
            <Link className="ledger-row" to={`/boxes?q=${s.bl}`}>
              <div className="ledger-row-head">
                <span className="ledger-row-id mono">{s.bookingNo}</span>
                <span className={`pill pill-sh-${s.status}`}>{tx(shipmentStatusI18n[s.status])}</span>
              </div>
              <p className="ledger-row-meta">
                <span>{c ? customerName(c, locale) : "—"}</span>
                <span aria-hidden>·</span>
                <span>
                  {s.vessel} {s.voyage}
                </span>
              </p>
              <div className="ledger-row-foot ledger-row-foot--spread">
                <span className="mono ledger-row-lane">
                  {s.pol} → {s.pod}
                </span>
                <span className="ledger-row-nums">
                  {s.teu} TEU · {boxCounts[s.id] ?? 0} {tx("colBoxes")}
                </span>
              </div>
              <p className="ledger-row-dates">
                ETD <time dateTime={s.etd}>{s.etd}</time> · ETA <time dateTime={s.eta}>{s.eta}</time>
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
