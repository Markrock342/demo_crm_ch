import type { Box, BoxStatus, Customer } from "../data";
import { customerName } from "../data";
import type { Locale } from "../i18n";
import { t } from "../i18n";

type Props = {
  boxes: Box[];
  customers: Customer[];
  locale: Locale;
  onOpen: (box: Box) => void;
  onStatusChange?: (id: string, status: BoxStatus) => void;
};

const statuses: BoxStatus[] = ["yard", "sail", "clear", "hold", "empty"];

export function BoxLedgerCards({ boxes, customers, locale, onOpen, onStatusChange }: Props) {
  const tx = (key: string) => t(locale, key);

  return (
    <ul className="ledger-list" aria-label={tx("boxesTitle")}>
      {boxes.map((b) => {
        const c = customers.find((x) => x.id === b.customerId);
        return (
          <li key={b.id}>
            <button type="button" className="ledger-row" onClick={() => onOpen(b)}>
              <div className="ledger-row-head">
                <span className="ledger-row-id mono">{b.id}</span>
                <time className="ledger-row-eta">{b.eta}</time>
              </div>
              <p className="ledger-row-meta">
                <span>{c ? customerName(c, locale) : "—"}</span>
                <span aria-hidden>·</span>
                <span>{b.type}</span>
                <span aria-hidden>·</span>
                <span>{tx(b.dir === "in" ? "inboundShort" : "outboundShort")}</span>
                {b.bl ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="mono">{b.bl}</span>
                  </>
                ) : null}
              </p>
              <div className="ledger-row-foot">
                {onStatusChange ? (
                  <label className="ledger-row-status" onClick={(e) => e.stopPropagation()}>
                    <span className="sr-only">{tx("pickStatus")}</span>
                    <select
                      className={`status-select pill-${b.status}`}
                      value={b.status}
                      onChange={(e) => onStatusChange(b.id, e.target.value as BoxStatus)}
                    >
                      {statuses.map((s) => (
                        <option key={s} value={s}>
                          {tx(`st${cap(s)}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <span className={`pill pill-${b.status}`}>{tx(`st${cap(b.status)}`)}</span>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
