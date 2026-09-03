import { useMemo, useState, type FormEvent } from "react";
import { leadStageI18n, leadStages, type LeadStage } from "../crm";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useStore } from "../store";
import { LeadLedgerCards } from "../ui/LeadLedgerCards";
import { PageToolbar } from "../ui/PageToolbar";
import { useMedia } from "../ui/useMedia";

const leadFormInitial = {
  company: "",
  city: "",
  lane: "",
  contact: "",
  source: "shell",
  teu: 8,
  owner: "shell",
};

export function LeadsPage() {
  const shell = useIsShellMode();
  const store = useStore();
  const crm = useShellCrm();
  const { tx, locale, query } = store;
  const leads = shell ? crm.leads : store.leads;
  const setLeadStage = shell ? crm.setLeadStage : store.setLeadStage;
  const addLead = shell ? crm.addLead : store.addLead;
  const convertLead = shell ? () => undefined : store.convertLead;
  const mobile = useMedia("(max-width: 1024px)");
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<LeadStage | "all">("all");
  const [form, setForm] = useState(leadFormInitial);
  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      leads.filter((l) => {
        if (stage !== "all" && l.stage !== stage) return false;
        const blob = `${l.company} ${l.city} ${l.lane} ${l.contact} ${l.source} ${l.owner}`.toLowerCase();
        return !q || blob.includes(q);
      }),
    [leads, q, stage],
  );

  const counts = useMemo(() => {
    const map: Record<LeadStage | "all", number> = { all: leads.length, new: 0, working: 0, qualified: 0, lost: 0 };
    for (const l of leads) {
      if (l.stage in map) map[l.stage as LeadStage] += 1;
    }
    return map;
  }, [leads]);

  function submit(e: FormEvent) {
    e.preventDefault();
    addLead(form);
    setForm({ ...form, company: "", contact: "" });
    setOpen(false);
  }

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("leadsTitle")}
        count={rows.length}
        hint={shell ? tx("emptyShellCrm") : tx("leadsHint")}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {tx("shellCreateLead")}
          </button>
        }
        filters={
          <div className="filter-row" role="tablist" aria-label={tx("colStage")}>
            <button
              type="button"
              role="tab"
              aria-selected={stage === "all"}
              className={`filter-chip${stage === "all" ? " is-on" : ""}`}
              onClick={() => setStage("all")}
            >
              <span>{tx("filterAll")}</span>
              <em>{counts.all}</em>
            </button>
            {leadStages.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={stage === s}
                className={`filter-chip${stage === s ? " is-on" : ""}`}
                onClick={() => setStage(s)}
              >
                <span>{tx(leadStageI18n[s])}</span>
                <em>{counts[s]}</em>
              </button>
            ))}
          </div>
        }
      />

      {open ? (
        <form
          className="form form-stack"
          onSubmit={submit}
          onReset={(e) => {
            e.preventDefault();
            setForm(leadFormInitial);
            setOpen(false);
          }}
        >
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
            <input type="number" min={1} inputMode="numeric" value={form.teu} onChange={(e) => setForm({ ...form, teu: Number(e.target.value) })} />
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
        <p className="empty">{tx("emptyShellCrm")}</p>
      ) : mobile ? (
        <LeadLedgerCards
          leads={rows as import("../crm").Lead[]}
          locale={locale}
          onStageChange={(id, s) => setLeadStage(id, s)}
          onConvert={(id) => convertLead(id)}
        />
      ) : (
        <div className="table-shell">
          <table className="data-table">
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
                  <td className="cell-strong">{l.company}</td>
                  <td>{l.city}</td>
                  <td className="cell-truncate">{l.lane}</td>
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
                    {!shell && l.stage !== "lost" ? (
                      <button type="button" className="btn btn-ghost btn-slim" onClick={() => convertLead(l.id)}>
                        {tx("convertLead")}
                      </button>
                    ) : (
                      <span className="pill pill-empty">{tx(leadStageI18n[l.stage as LeadStage] ?? "leadNew")}</span>
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
