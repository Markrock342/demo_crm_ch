import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { shipmentStatusI18n, type ShipmentStatus } from "../logistics";
import { customerName } from "../data";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";
import { ClickableTableRow } from "../ui/ClickableTableRow";
import { ShipmentLedgerCards } from "../ui/ShipmentLedgerCards";
import { useMedia } from "../ui/useMedia";

const statuses: Array<ShipmentStatus | "all"> = ["all", "booking", "gate_in", "sail", "arrived", "delivered"];

export function ShipmentsPage() {
  const { tx, locale, shipments, customers, boxes, query } = useStore();
  const navigate = useNavigate();
  const mobile = useMedia("(max-width: 1024px)");
  const [status, setStatus] = useState<ShipmentStatus | "all">("all");
  const q = query.trim().toLowerCase();

  const rows = useMemo(
    () =>
      shipments.filter((s) => {
        if (status !== "all" && s.status !== status) return false;
        const c = customers.find((x) => x.id === s.customerId);
        const blob = `${s.bookingNo} ${s.bl} ${s.vessel} ${s.pol} ${s.pod} ${c ? customerName(c, locale) : ""}`.toLowerCase();
        return !q || blob.includes(q);
      }),
    [customers, locale, q, shipments, status],
  );

  const counts = useMemo(() => {
    const map: Record<ShipmentStatus | "all", number> = {
      all: shipments.length,
      booking: 0,
      gate_in: 0,
      sail: 0,
      arrived: 0,
      delivered: 0,
    };
    for (const s of shipments) map[s.status] += 1;
    return map;
  }, [shipments]);

  const boxCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of rows) {
      map[s.id] = boxes.filter((b) => b.shipmentId === s.id || b.bl === s.bl).length;
    }
    return map;
  }, [boxes, rows]);

  const totalTeu = rows.reduce((n, s) => n + s.teu, 0);

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("shipmentsTitle")}
        count={rows.length}
        hint={tx("shipmentsHintShort")}
        filters={
          <div className="filter-row" role="tablist" aria-label={tx("colStatus")}>
            {statuses.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={status === s}
                className={`filter-chip${status === s ? " is-on" : ""}`}
                onClick={() => setStatus(s)}
              >
                <span>{s === "all" ? tx("filterAll") : tx(shipmentStatusI18n[s])}</span>
                <em>{counts[s]}</em>
              </button>
            ))}
          </div>
        }
      />

      <div className="stat-strip">
        <div className="stat-chip">
          <span>{tx("colTeu")}</span>
          <strong>{totalTeu}</strong>
        </div>
        <div className="stat-chip">
          <span>{tx("colBoxes")}</span>
          <strong>{Object.values(boxCounts).reduce((n, v) => n + v, 0)}</strong>
        </div>
        <div className="stat-chip">
          <span>{tx("filterAll")}</span>
          <strong>{rows.length}</strong>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="empty">{tx("emptyShipments")}</p>
      ) : mobile ? (
        <ShipmentLedgerCards shipments={rows} customers={customers} locale={locale} boxCounts={boxCounts} />
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tx("colBooking")}</th>
                <th>{tx("colCustomer")}</th>
                <th>{tx("colVessel")}</th>
                <th>{tx("colLane")}</th>
                <th className="num">{tx("colTeu")}</th>
                <th className="num">{tx("colEtd")}</th>
                <th className="num">{tx("colEta")}</th>
                <th>{tx("colStatus")}</th>
                <th className="num">{tx("colBoxes")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const c = customers.find((x) => x.id === s.customerId);
                const boxCount = boxCounts[s.id] ?? 0;
                return (
                  <ClickableTableRow key={s.id} onActivate={() => navigate(`/boxes?q=${s.bl}`)}>
                    <td className="mono cell-strong">{s.bookingNo}</td>
                    <td className="cell-truncate">{c ? customerName(c, locale) : "—"}</td>
                    <td className="cell-truncate">
                      {s.vessel}
                      <span className="meta"> · {s.voyage}</span>
                    </td>
                    <td className="mono cell-lane">
                      {s.pol} → {s.pod}
                    </td>
                    <td className="num">{s.teu}</td>
                    <td className="num">{s.etd}</td>
                    <td className="num">{s.eta}</td>
                    <td>
                      <span className={`pill pill-sh-${s.status}`}>{tx(shipmentStatusI18n[s.status])}</span>
                    </td>
                    <td className="num">{boxCount}</td>
                  </ClickableTableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="page-foot">
        {tx("shipmentsFoot")}{" "}
        <Link to="/docs">{tx("navDocs")}</Link>
      </p>
    </div>
  );
}
