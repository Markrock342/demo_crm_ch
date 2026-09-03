import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { customerName, type BoxStatus, type Customer, type Direction } from "../data";
import { useContainers } from "../hooks/useContainers";
import { canEditLogistics } from "../shell/nav.ts";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useShellOps, YARD_SLOTS } from "../shell/opsStore.tsx";
import { useIsShellMode, useShellSession } from "../shell/session.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

const statuses: BoxStatus[] = ["yard", "sail", "clear", "hold", "empty"];

export function BoxesPage() {
  const shell = useIsShellMode();
  const { shellUser } = useShellSession();
  const store = useStore();
  const crm = useShellCrm();
  const ops = useShellOps();
  const containers = useContainers();
  const { tx, locale, query } = store;
  const canEdit = shell ? canEditLogistics(shellUser?.department ?? null) : true;
  const customers = shell ? crm.customers : store.customers;
  const boxes = shell ? ops.boxes : containers.boxes;
  const [status, setStatus] = useState<BoxStatus | "all">("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    id: "",
    customerId: "",
    type: "40HC",
    dir: "in" as Direction,
    status: "yard" as BoxStatus,
    slot: "A1",
    bl: "",
    teu: 2,
  });
  const q = query.trim().toLowerCase();

  const rows = useMemo(() => {
    return boxes.filter((b) => {
      if (status !== "all" && b.status !== status) return false;
      const c = customers.find((x) => x.id === b.customerId);
      const blob = `${b.id} ${b.bl} ${b.yardZh} ${c ? customerName(c as Customer, locale) : ""}`.toLowerCase();
      return !q || blob.includes(q);
    });
  }, [boxes, customers, locale, q, status]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!shell || !canEdit) return;
    const fail = ops.addBox({
      ...form,
      customerId: form.customerId || customers[0]?.id || "",
    });
    if (fail) return;
    setForm({ ...form, id: "", bl: "" });
    setOpen(false);
  }

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("boxesTitle")}
        count={rows.length}
        hint={shell ? `${tx("shellDataBadge")}${canEdit ? "" : ` · ${tx("shellReadOnly")}`}` : tx("boxesHint")}
        actions={
          shell && canEdit ? (
            <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)} disabled={customers.length === 0}>
              {tx("createShellBox")}
            </button>
          ) : null
        }
        filters={
          <div className="filter-row" role="tablist">
            {(["all", ...statuses] as const).map((s) => (
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

      {shell && customers.length === 0 ? (
        <p className="meta">
          {tx("quoteNeedCustomer")} <Link to="/customers">{tx("shellCreateCustomer")}</Link>
        </p>
      ) : null}

      {open && shell && canEdit ? (
        <form className="form form-stack" onSubmit={submit}>
          <label>
            {tx("colBox")}
            <input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} required />
          </label>
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
            Slot
            <select value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value })}>
              {YARD_SLOTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            BL
            <input value={form.bl} onChange={(e) => setForm({ ...form, bl: e.target.value })} />
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
                <th>{tx("colBox")}</th>
                <th>{tx("colCustomer")}</th>
                <th>{tx("colStatus")}</th>
                <th>{tx("colYard")}</th>
                <th>BL</th>
                <th>{tx("colTeu")}</th>
                {shell && canEdit ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const c = customers.find((x) => x.id === b.customerId);
                return (
                  <tr key={b.id}>
                    <td className="mono cell-strong">{b.id}</td>
                    <td>{c ? customerName(c as Customer, locale) : b.customerId}</td>
                    <td>
                      <span className="pill">{b.status}</span>
                    </td>
                    <td>{b.yardZh}</td>
                    <td className="mono">{b.bl}</td>
                    <td className="num">{b.teu}</td>
                    {shell && canEdit ? (
                      <td>
                        <select
                          className="deal-select"
                          value={b.status}
                          onChange={(e) => ops.setBoxStatus(b.id, e.target.value as BoxStatus)}
                        >
                          {statuses.map((s) => (
                            <option key={s} value={s}>
                              {s}
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
