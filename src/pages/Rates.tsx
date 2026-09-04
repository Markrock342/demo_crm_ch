import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useShellQuotes } from "../shell/quoteStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useShellSupport } from "../shell/supportStore.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

import { uiV2 } from "../v2/config.ts";
import { RatesPageV2 } from "../v2/pages/RatesPage.tsx";

export function RatesPage() {
  if (uiV2) return <RatesPageV2 />;
  const shell = useIsShellMode();
  const { tx } = useStore();
  const support = useShellSupport();
  const quotes = useShellQuotes();
  const crm = useShellCrm();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    origin: "Shanghai",
    destination: "Laem Chabang",
    containerType: "40HC",
    buyAmount: 1000,
    sellAmount: 1200,
    carrier: "COSCO",
    currency: "USD",
    validFrom: "2026-08-01",
    validUntil: "2026-12-31",
    localCharges: 120,
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

  function createQuote(rateId: string) {
    const rate = support.rates.find((r) => r.id === rateId);
    const customerId = crm.customers[0]?.id;
    if (!rate || !customerId) {
      setMsg(tx("quoteNeedCustomer"));
      return;
    }
    const err = quotes.createDraft({
      customerId,
      origin: rate.origin,
      destination: rate.destination,
      pol: "—",
      pod: "—",
      mode: "FCL",
      containerType: rate.containerType,
      quantity: 1,
      currency: rate.currency,
      charges: [
        { description: `Ocean freight (${rate.carrier})`, sellAmount: rate.sellAmount, currency: rate.currency },
        ...(rate.localCharges
          ? [{ description: "Local charges", sellAmount: rate.localCharges, currency: rate.currency }]
          : []),
      ],
      validFrom: rate.validFrom,
      validUntil: rate.validUntil,
      termsAndConditions: `From rate ${rate.id}`,
    });
    if (err) {
      setMsg(tx(err));
      return;
    }
    setMsg(tx("quoteFromRateCreated"));
    navigate("/quotations");
  }

  return (
    <div className="page page--workspace page--rates">
      <PageToolbar
        title={tx("ratesTitle")}
        count={rows.length}
        hint={shell ? `${tx("shellDataBadge")} · FCL` : tx("apiNotConfigured")}
        actions={
          shell ? (
            <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? tx("cancel") : tx("save")}
            </button>
          ) : null
        }
        filters={
          shell ? (
            <div className="filter-fields">
              <label className="filter-field">
                <span className="filter-field-label">{tx("colOrigin")}</span>
                <input
                  value={q.origin}
                  onChange={(e) => setQ({ ...q, origin: e.target.value })}
                  placeholder={tx("colOrigin")}
                />
              </label>
              <label className="filter-field">
                <span className="filter-field-label">{tx("colDestination")}</span>
                <input
                  value={q.destination}
                  onChange={(e) => setQ({ ...q, destination: e.target.value })}
                  placeholder={tx("colDestination")}
                />
              </label>
            </div>
          ) : null
        }
      />
      {msg ? <p className="meta">{msg}</p> : null}

      {open && shell ? (
        <form className="form form-stack" onSubmit={submit}>
          <label>
            {tx("colOrigin")}
            <input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} />
          </label>
          <label>
            {tx("colDestination")}
            <input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
          </label>
          <label>
            {tx("colCarrier")}
            <input value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} />
          </label>
          <label>
            {tx("colBuy")}
            <input type="number" value={form.buyAmount} onChange={(e) => setForm({ ...form, buyAmount: Number(e.target.value) })} />
          </label>
          <label>
            {tx("colSell")}
            <input type="number" value={form.sellAmount} onChange={(e) => setForm({ ...form, sellAmount: Number(e.target.value) })} />
          </label>
          <label>
            {tx("quoteValidFrom")}
            <input value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
          </label>
          <label>
            {tx("quoteValidUntil")}
            <input value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              {tx("save")}
            </button>
          </div>
        </form>
      ) : null}

      {!shell ? <p className="empty">{tx("apiNotConfigured")}</p> : null}

      {shell && rows.length === 0 ? <p className="empty">{tx("emptyShellCrm")}</p> : null}

      {shell && rows.length > 0 ? (
        <div className="table-shell">
          <table className="data-table rates-table">
            <thead>
              <tr>
                <th scope="col">{tx("colLane")}</th>
                <th scope="col">{tx("colCarrier")}</th>
                <th scope="col" className="num">
                  {tx("colBuy")}
                </th>
                <th scope="col" className="num">
                  {tx("colSell")}
                </th>
                <th scope="col" className="num">
                  {tx("colMargin")}
                </th>
                <th scope="col">{tx("quoteValidUntil")}</th>
                <th scope="col" className="col-actions">
                  <span className="sr-only">{tx("colActions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const margin = r.sellAmount ? Math.round(((r.sellAmount - r.buyAmount) / r.sellAmount) * 1000) / 10 : 0;
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="cell-strong">
                        {r.origin} → {r.destination}
                      </span>
                      <span className="meta"> · {r.containerType}</span>
                    </td>
                    <td>{r.carrier}</td>
                    <td className="num mono">
                      {r.buyAmount} {r.currency}
                    </td>
                    <td className="num mono">
                      {r.sellAmount} {r.currency}
                    </td>
                    <td className="num">{margin}%</td>
                    <td className="mono meta">
                      {r.validFrom} – {r.validUntil}
                    </td>
                    <td className="col-actions">
                      <button type="button" className="btn btn-ghost btn-slim" onClick={() => createQuote(r.id)}>
                        {tx("rateCreateQuote")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
