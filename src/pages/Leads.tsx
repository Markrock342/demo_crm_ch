import { useMemo, useState, type FormEvent } from "react";
import { leadStageI18n, leadStages, type LeadStage } from "../crm";
import { useStore } from "../store";

export function LeadsPage() {
  const { tx, leads, query, setLeadStage, convertLead, addLead } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    company: "",
    city: "",
    lane: "",
    contact: "",
    source: "协会",
    teu: 8,
    owner: "林晓衡",
  });
  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      leads.filter((l) => {
        const blob = `${l.company} ${l.city} ${l.lane} ${l.contact} ${l.source} ${l.owner}`.toLowerCase();
        return !q || blob.includes(q);
      }),
    [leads, q],
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    addLead(form);
    setForm({ ...form, company: "", contact: "" });
    setOpen(false);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{tx("leadsTitle")}</h1>
          <p>{tx("leadsHint")}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {tx("addLead")}
        </button>
      </div>

      {open ? (
        <form className="form" onSubmit={submit}>
          <label>
            {tx("colCompany")}
            <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} required />
          </label>
          <label>
            {tx("city")}
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </label>
          <label>
            {tx("lane")}
            <input value={form.lane} onChange={(e) => setForm({ ...form, lane: e.target.value })} />
          </label>
          <label>
            {tx("navContacts")}
            <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          </label>
          <label>
            {tx("colSource")}
            <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          </label>
          <label>
            {tx("colTeu")}
            <input type="number" value={form.teu} onChange={(e) => setForm({ ...form, teu: Number(e.target.value) })} />
          </label>
          <div className="form-actions">
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
        <p className="empty">{tx("emptyLeads")}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tx("colCompany")}</th>
                <th>{tx("city")}</th>
                <th>{tx("colLane")}</th>
                <th>{tx("navContacts")}</th>
                <th>{tx("colSource")}</th>
                <th>{tx("colStage")}</th>
                <th className="num">{tx("colTeu")}</th>
                <th>{tx("colOwner")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td>{l.company}</td>
                  <td>{l.city}</td>
                  <td>{l.lane}</td>
                  <td>{l.contact}</td>
                  <td>{l.source}</td>
                  <td>
                    <select
                      className="status-select"
                      value={l.stage}
                      onChange={(e) => setLeadStage(l.id, e.target.value as LeadStage)}
                      aria-label={tx("colStage")}
                    >
                      {leadStages.map((s) => (
                        <option key={s} value={s}>
                          {tx(leadStageI18n[s])}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num">{l.teu}</td>
                  <td>{l.owner}</td>
                  <td>
                    {l.stage !== "lost" ? (
                      <button type="button" className="btn btn-ghost btn-slim" onClick={() => convertLead(l.id)}>
                        {tx("convertLead")}
                      </button>
                    ) : (
                      <span className="pill pill-empty">{tx(leadStageI18n[l.stage])}</span>
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
