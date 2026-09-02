import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cityName, customerName, laneName } from "../data";
import { useStore } from "../store";

export function CustomersPage() {
  const { tx, locale, customers, query, addCustomer, reset } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const q = (params.get("q") ?? query).trim().toLowerCase();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ nameZh: "", cityZh: "", laneZh: "", owner: "" });

  const rows = useMemo(
    () =>
      customers.filter((c) => {
        const blob = `${c.nameZh} ${c.nameTh} ${c.nameEn} ${c.cityZh} ${c.laneZh} ${c.owner}`.toLowerCase();
        return !q || blob.includes(q);
      }),
    [customers, q],
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const fail = addCustomer(form);
    if (fail) {
      setErr(tx(fail));
      return;
    }
    setErr(null);
    setForm({ nameZh: "", cityZh: "", laneZh: "", owner: "" });
    setOpen(false);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{tx("customersTitle")}</h1>
          <p>{tx("customersHint")}</p>
        </div>
        <div className="toolbar">
          <button type="button" className="btn btn-ghost" onClick={reset}>
            {tx("resetDemo")}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {tx("addCustomer")}
          </button>
        </div>
      </div>

      {open ? (
        <form className="form" onSubmit={submit} noValidate>
          <label>
            {tx("name")}
            <input
              value={form.nameZh}
              onChange={(e) => setForm({ ...form, nameZh: e.target.value })}
              required
              aria-invalid={!!err}
              aria-describedby={err ? "cust-err" : undefined}
            />
          </label>
          <label>
            {tx("city")}
            <input value={form.cityZh} onChange={(e) => setForm({ ...form, cityZh: e.target.value })} />
          </label>
          <label>
            {tx("lane")}
            <input value={form.laneZh} onChange={(e) => setForm({ ...form, laneZh: e.target.value })} />
          </label>
          <label>
            {tx("owner")}
            <input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
          </label>
          <div className="form-actions">
            {err ? (
              <p id="cust-err" className="field-err" role="alert">
                {err}
              </p>
            ) : null}
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              {tx("cancel")}
            </button>
            <button type="submit" className="btn btn-primary">
              {tx("save")}
            </button>
          </div>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <p className="empty">{tx("noMatch")}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">{tx("selectRow")}</caption>
            <thead>
              <tr>
                <th>{tx("colCustomer")}</th>
                <th>{tx("city")}</th>
                <th>{tx("colLane")}</th>
                <th className="num">{tx("colBoxes")}</th>
                <th>{tx("colOwner")}</th>
                <th className="num">{tx("colAr")}</th>
                <th className="num">{tx("colUpdated")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  tabIndex={0}
                  onClick={() => navigate(`/customers/${c.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") navigate(`/customers/${c.id}`);
                  }}
                >
                  <td>{customerName(c, locale)}</td>
                  <td>{cityName(c, locale)}</td>
                  <td>{laneName(c, locale)}</td>
                  <td className="num">{c.boxes}</td>
                  <td>{c.owner}</td>
                  <td className="num">{c.arDays}</td>
                  <td className="num">{c.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
