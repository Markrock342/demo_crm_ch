import { useMemo, useState, type FormEvent } from "react";
import { useShellOps } from "../shell/opsStore.tsx";
import { useShellSupport } from "../shell/supportStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

const statuses = ["all", "ok", "wait", "late"] as const;

export function DocsPage() {
  const shell = useIsShellMode();
  const store = useStore();
  const support = useShellSupport();
  const ops = useShellOps();
  const { tx, query } = store;
  const [status, setStatus] = useState<(typeof statuses)[number]>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "B/L", boxId: "", shipmentId: "" });
  const q = query.trim().toLowerCase();

  const docs = shell ? support.docs : store.docs;

  const rows = useMemo(
    () =>
      docs.filter((d) => {
        if (status !== "all" && d.status !== status) return false;
        const blob = `${d.name} ${"boxId" in d ? d.boxId ?? "" : ""} ${"kind" in d ? (d as { kind?: string }).kind ?? "" : ""}`.toLowerCase();
        return !q || blob.includes(q);
      }),
    [docs, q, status],
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!shell) return;
    support.addDoc({
      name: form.name,
      boxId: form.boxId || undefined,
      shipmentId: form.shipmentId || undefined,
    });
    setOpen(false);
  }

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("docsTitle")}
        count={rows.length}
        hint={shell ? `${tx("shellDataBadge")} · checklist` : tx("docsHint")}
        actions={
          shell ? (
            <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)}>
              {tx("save")}
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
                {s === "all" ? tx("filterAll") : s}
              </button>
            ))}
          </div>
        }
      />

      {open && shell ? (
        <form className="form form-stack" onSubmit={submit}>
          <label>
            {tx("colTitle")}
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            {tx("colBox")}
            <select value={form.boxId} onChange={(e) => setForm({ ...form, boxId: e.target.value })}>
              <option value="">—</option>
              {ops.boxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tx("navShipments")}
            <select value={form.shipmentId} onChange={(e) => setForm({ ...form, shipmentId: e.target.value })}>
              <option value="">—</option>
              {ops.shipments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.bookingNo}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-primary">
            {tx("save")}
          </button>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <p className="empty">{tx("emptyShellCrm")}</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tx("colTitle")}</th>
                <th>{tx("colBox")}</th>
                <th>{tx("colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="cell-strong">{d.name}</td>
                  <td className="mono">{"boxId" in d ? d.boxId ?? "—" : "—"}</td>
                  <td>
                    {shell ? (
                      <select
                        className="deal-select"
                        value={d.status}
                        onChange={(e) => support.setDocStatus(d.id, e.target.value as "ok" | "wait" | "late")}
                      >
                        <option value="ok">ok</option>
                        <option value="wait">wait</option>
                        <option value="late">late</option>
                      </select>
                    ) : (
                      <span className="pill">{d.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
