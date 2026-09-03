import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cityName, customerName, laneName, type Customer } from "../data";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useStore } from "../store";
import { ClickableTableRow } from "../ui/ClickableTableRow";
import { CustomerLedgerCards } from "../ui/CustomerLedgerCards";
import { PageToolbar } from "../ui/PageToolbar";
import { useMedia } from "../ui/useMedia";

export function CustomersPage() {
  const shell = useIsShellMode();
  const store = useStore();
  const crm = useShellCrm();
  const { tx, locale, query } = store;
  const customers = shell ? crm.customers : store.customers;
  const addCustomer = shell ? crm.addCustomer : store.addCustomer;
  const navigate = useNavigate();
  const mobile = useMedia("(max-width: 1024px)");
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

  const boxCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of rows) map[c.id] = 0;
    return map;
  }, [rows]);

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
    <div className="page page--workspace">
      <PageToolbar
        title={tx("customersTitle")}
        count={rows.length}
        hint={shell ? tx("emptyShellCrm") : tx("customersHint")}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {tx("shellCreateCustomer")}
          </button>
        }
      />

      {open ? (
        <form
          className="form form-stack"
          onSubmit={submit}
          noValidate
          onReset={(e) => {
            e.preventDefault();
            setForm({ nameZh: "", cityZh: "", laneZh: "", owner: "" });
            setErr(null);
            setOpen(false);
          }}
        >
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
            <button type="reset" className="btn btn-ghost">
              {tx("cancel")}
            </button>
            <button type="submit" className="btn btn-primary">
              {tx("save")}
            </button>
          </div>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <p className="empty">{tx("emptyShellCrm")}</p>
      ) : mobile ? (
        <CustomerLedgerCards customers={rows as Customer[]} boxCounts={boxCounts} locale={locale} />
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <caption className="sr-only">{tx("selectRow")}</caption>
            <thead>
              <tr>
                <th scope="col">{tx("colCustomer")}</th>
                <th scope="col">{tx("city")}</th>
                <th scope="col">{tx("colLane")}</th>
                <th scope="col">{tx("colOwner")}</th>
                <th scope="col" className="num">
                  {tx("colUpdated")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <ClickableTableRow key={c.id} onActivate={() => navigate(`/customers/${c.id}`)}>
                  <td>{customerName(c as Customer, locale)}</td>
                  <td>{cityName(c as Customer, locale)}</td>
                  <td>{laneName(c as Customer, locale)}</td>
                  <td>{c.owner}</td>
                  <td className="num">{c.updated}</td>
                </ClickableTableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
