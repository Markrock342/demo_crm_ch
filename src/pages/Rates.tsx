import { useMemo, useState, type FormEvent } from "react";
import { useShellSupport } from "../shell/supportStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

export function RatesPage() {
  const shell = useIsShellMode();
  const { tx } = useStore();
  const support = useShellSupport();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    origin: "Shanghai",
    destination: "Laem Chabang",
    containerType: "40HC",
    sellAmount: 1200,
    currency: "USD",
    validUntil: "2026-12-31",
  });
  const [q, setQ] = useState({ origin: "", destination: "" });

  const rows = useMemo(() => {
    if (!shell) return [];
    return support.rates.filter((r) => {
      if (q.origin && !r.origin.toLowerCase().includes(q.origin.toLowerCase())) return false;
      if (q.destination && !r.destination.toLowerCase().includes(q.destination.toLowerCase())) return false;
      return true;
    });
  }, [q, shell, support.rates]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!shell) return;
    support.addRate(form);
    setOpen(false);
  }

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("ratesTitle")}
        count={rows.length}
        hint={shell ? `${tx("shellDataBadge")} · FCL` : tx("apiNotConfigured")}
        actions={
          shell ? (
            <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)}>
              {tx("save")}
            </button>
          ) : null
        }
        filters={
          shell ? (
            <div className="form" style={{ marginInline: 0 }}>
              <label>
                Origin
                <input value={q.origin} onChange={(e) => setQ({ ...q, origin: e.target.value })} />
              </label>
              <label>
                Destination
                <input value={q.destination} onChange={(e) => setQ({ ...q, destination: e.target.value })} />
              </label>
            </div>
          ) : null
        }
      />

      {!shell ? <p className="meta">{tx("apiNotConfigured")}</p> : null}

      {open && shell ? (
        <form className="form form-stack" onSubmit={submit}>
          <label>
            Origin
            <input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} required />
          </label>
          <label>
            Destination
            <input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} required />
          </label>
          <label>
            {tx("colBoxType")}
            <input value={form.containerType} onChange={(e) => setForm({ ...form, containerType: e.target.value })} />
          </label>
          <label>
            {tx("colSell")}
            <input type="number" value={form.sellAmount} onChange={(e) => setForm({ ...form, sellAmount: Number(e.target.value) })} />
          </label>
          <button type="submit" className="btn btn-primary">
            {tx("save")}
          </button>
        </form>
      ) : null}

      {shell && rows.length === 0 ? <p className="empty">{tx("emptyShellCrm")}</p> : null}

      {shell && rows.length > 0 ? (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Origin</th>
                <th>Destination</th>
                <th>{tx("colBoxType")}</th>
                <th>{tx("colSell")}</th>
                <th>{tx("colClose")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.origin}</td>
                  <td>{r.destination}</td>
                  <td className="mono">{r.containerType}</td>
                  <td className="mono">
                    {r.sellAmount} {r.currency}
                  </td>
                  <td className="mono">{r.validUntil}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
