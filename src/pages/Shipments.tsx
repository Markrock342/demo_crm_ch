import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { customerName, type Customer } from "../data";
import { shipmentStatusI18n, type ShipmentStatus } from "../logistics";
import { canEditLogistics } from "../shell/nav.ts";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useShellOps } from "../shell/opsStore.tsx";
import { useIsShellMode, useShellSession } from "../shell/session.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

const statuses: Array<ShipmentStatus | "all"> = ["all", "booking", "gate_in", "sail", "arrived", "delivered"];

export function ShipmentsPage() {
  const shell = useIsShellMode();
  const { shellUser } = useShellSession();
  const store = useStore();
  const crm = useShellCrm();
  const ops = useShellOps();
  const { tx, locale, query } = store;
  const canEdit = shell ? canEditLogistics(shellUser?.department ?? null) : true;
  const customers = shell ? crm.customers : store.customers;
  const shipments = shell ? ops.shipments : store.shipments;
  const boxes = shell ? ops.boxes : store.boxes;
  const [status, setStatus] = useState<ShipmentStatus | "all">("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    customerId: "",
    bookingNo: "",
    bl: "",
    vessel: "",
    voyage: "",
    carrier: "COSCO",
    pol: "CNSHA",
    pod: "THLCH",
    etd: "",
    eta: "",
    teu: 2,
  });
  const q = query.trim().toLowerCase();

  const rows = useMemo(
    () =>
      shipments.filter((s) => {
        if (status !== "all" && s.status !== status) return false;
        const c = customers.find((x) => x.id === s.customerId);
        const blob = `${s.bookingNo} ${s.bl} ${s.vessel} ${s.pol} ${s.pod} ${c ? customerName(c as Customer, locale) : ""}`.toLowerCase();
        return !q || blob.includes(q);
      }),
    [customers, locale, q, shipments, status],
  );

  const boxCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of rows) {
      map[s.id] = boxes.filter((b) => ("shipmentId" in b ? b.shipmentId === s.id : false) || b.bl === s.bl).length;
    }
    return map;
  }, [boxes, rows]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!shell || !canEdit) return;
    ops.addShipment({
      ...form,
      customerId: form.customerId || customers[0]?.id || "",
    });
    setForm({ ...form, bookingNo: "", bl: "" });
    setOpen(false);
  }

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("shipmentsTitle")}
        count={rows.length}
        hint={shell ? `${tx("shellDataBadge")}${canEdit ? "" : ` · ${tx("shellReadOnly")}`}` : tx("shipmentsHintShort")}
        actions={
          shell && canEdit ? (
            <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)} disabled={customers.length === 0}>
              {tx("createShellShipment")}
            </button>
          ) : null
        }
        filters={
          <div className="filter-row" role="tablist">
            {statuses.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={status === s}
                className={`filter-chip${status === s ? " is-on" : ""}`}
                onClick={() => setStatus(s)}
              >
                {s === "all" ? tx("filterAll") : tx(shipmentStatusI18n[s])}
              </button>
            ))}
          </div>
        }
      />

      {shell && customers.length === 0 ? (
        <p className="meta">
          {tx("quoteNeedCustomer")} <Link to="/customers">{tx("shellCreateCustomer")}</Link>
        </p>
      ) : null}

      {open && shell && canEdit ? (
        <form className="form form-stack" onSubmit={submit}>
          <label>
            {tx("colCustomer")}
            <select value={form.customerId || customers[0]?.id || ""} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {customerName(c as Customer, locale)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Booking
            <input value={form.bookingNo} onChange={(e) => setForm({ ...form, bookingNo: e.target.value })} required />
          </label>
          <label>
            Vessel
            <input value={form.vessel} onChange={(e) => setForm({ ...form, vessel: e.target.value })} />
          </label>
          <label>
            POL
            <input value={form.pol} onChange={(e) => setForm({ ...form, pol: e.target.value })} />
          </label>
          <label>
            POD
            <input value={form.pod} onChange={(e) => setForm({ ...form, pod: e.target.value })} />
          </label>
          <label>
            {tx("colTeu")}
            <input type="number" value={form.teu} onChange={(e) => setForm({ ...form, teu: Number(e.target.value) })} />
          </label>
          <p className="meta">FCL · CNSHA/CNNGB → THLCH</p>
          <button type="submit" className="btn btn-primary">
            {tx("save")}
          </button>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <p className="empty">{tx("emptyShipments")}</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Booking</th>
                <th>{tx("colCustomer")}</th>
                <th>Lane</th>
                <th>{tx("colStatus")}</th>
                <th>{tx("colTeu")}</th>
                <th>{tx("colBox")}</th>
                {shell && canEdit ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const c = customers.find((x) => x.id === s.customerId);
                return (
                  <tr key={s.id}>
                    <td className="mono cell-strong">{s.bookingNo}</td>
                    <td>{c ? customerName(c as Customer, locale) : s.customerId}</td>
                    <td className="mono">
                      {s.pol}→{s.pod}
                    </td>
                    <td>
                      <span className="pill">{tx(shipmentStatusI18n[s.status as ShipmentStatus] ?? "colStatus")}</span>
                    </td>
                    <td className="num">{s.teu}</td>
                    <td className="num">{boxCounts[s.id] ?? 0}</td>
                    {shell && canEdit ? (
                      <td>
                        <select
                          className="deal-select"
                          value={s.status}
                          onChange={(e) => ops.setShipmentStatus(s.id, e.target.value as ShipmentStatus)}
                        >
                          {statuses.filter((x) => x !== "all").map((st) => (
                            <option key={st} value={st}>
                              {tx(shipmentStatusI18n[st])}
                            </option>
                          ))}
                        </select>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
