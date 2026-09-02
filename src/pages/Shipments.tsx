import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { shipmentStatusI18n, type ShipmentStatus } from "../logistics";
import { customerName } from "../data";
import { useStore } from "../store";
import { Segment } from "../ui/Segment";

const statuses: Array<ShipmentStatus | "all"> = ["all", "booking", "gate_in", "sail", "arrived", "delivered"];

export function ShipmentsPage() {
  const { tx, locale, shipments, customers, boxes, query } = useStore();
  const navigate = useNavigate();
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

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{tx("shipmentsTitle")}</h1>
          <p>{tx("shipmentsHint")}</p>
        </div>
      </div>

      <Segment
        label={tx("colStatus")}
        value={status}
        onChange={setStatus}
        options={statuses.map((s) => ({ value: s, label: s === "all" ? tx("filterAll") : tx(shipmentStatusI18n[s]) }))}
      />

      {rows.length === 0 ? (
        <p className="empty">{tx("emptyShipments")}</p>
      ) : (
        <div className="table-wrap">
          <table>
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
                const boxCount = boxes.filter((b) => b.shipmentId === s.id || b.bl === s.bl).length;
                return (
                  <tr
                    key={s.id}
                    tabIndex={0}
                    onClick={() => navigate(`/boxes?q=${s.bl}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") navigate(`/boxes?q=${s.bl}`);
                    }}
                  >
                    <td className="mono">{s.bookingNo}</td>
                    <td>{c ? customerName(c, locale) : "—"}</td>
                    <td>
                      {s.vessel}
                      <span className="meta"> · {s.voyage}</span>
                    </td>
                    <td className="mono">
                      {s.pol} → {s.pod}
                    </td>
                    <td className="num">{s.teu}</td>
                    <td className="num">{s.etd}</td>
                    <td className="num">{s.eta}</td>
                    <td>
                      <span className={`pill pill-sh-${s.status}`}>{tx(shipmentStatusI18n[s.status])}</span>
                    </td>
                    <td className="num">{boxCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="hint">
        {tx("shipmentsFoot")}{" "}
        <Link to="/docs">{tx("navDocs")}</Link>
      </p>
    </div>
  );
}
