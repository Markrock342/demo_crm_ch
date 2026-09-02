import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { customerName } from "../data";
import { useStore } from "../store";
import { ClickableTableRow } from "../ui/ClickableTableRow";
import { PageToolbar } from "../ui/PageToolbar";

export function ContactsPage() {
  const { tx, locale, contacts, customers, query, addContact } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    customerId: customers[0]?.id ?? "",
    name: "",
    title: "",
    email: "",
    phone: "",
    wechat: "",
  });
  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      contacts
        .filter((p) => {
          const blob = `${p.name} ${p.title} ${p.email} ${p.phone} ${p.wechat}`.toLowerCase();
          return !q || blob.includes(q);
        })
        .slice()
        .sort((a, b) => Number(b.primary) - Number(a.primary)),
    [contacts, q],
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    addContact(form);
    setForm({ ...form, name: "", email: "", phone: "", wechat: "" });
    setOpen(false);
  }

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("contactsTitle")}
        count={rows.length}
        hint={tx("contactsHint")}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {tx("addContact")}
          </button>
        }
      />

      {open ? (
        <form
          className="form form-stack"
          onSubmit={submit}
          onReset={(e) => {
            e.preventDefault();
            setForm({
              customerId: customers[0]?.id ?? "",
              name: "",
              title: "",
              email: "",
              phone: "",
              wechat: "",
            });
            setOpen(false);
          }}
        >
          <label>
            {tx("colCustomer")}
            <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {customerName(c, locale)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tx("name")}
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            {tx("colTitle")}
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label>
            {tx("colEmail")}
            <input
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            {tx("colPhone")}
            <input
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label>
            {tx("colWechat")}
            <input value={form.wechat} onChange={(e) => setForm({ ...form, wechat: e.target.value })} />
          </label>
          <div className="form-actions">
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
        <p className="empty">{tx("emptyPeople")}</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tx("name")}</th>
                <th>{tx("colTitle")}</th>
                <th>{tx("colCustomer")}</th>
                <th>{tx("colEmail")}</th>
                <th>{tx("colPhone")}</th>
                <th>{tx("colWechat")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const c = customers.find((x) => x.id === p.customerId);
                return (
                  <ClickableTableRow key={p.id} onActivate={() => navigate(`/customers/${p.customerId}`)}>
                    <td className="cell-strong">
                      {p.name}
                      {p.primary ? <span className="pill pill-hold">{tx("primaryContact")}</span> : null}
                    </td>
                    <td>{p.title}</td>
                    <td>{c ? customerName(c, locale) : "—"}</td>
                    <td>{p.email}</td>
                    <td className="mono">{p.phone}</td>
                    <td className="mono">{p.wechat}</td>
                  </ClickableTableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
