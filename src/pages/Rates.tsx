import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createQuotationFromRate, searchRates, type RateSearchRow } from "../api/commercial.ts";
import { demoRates } from "../demo/commercial-demo.ts";
import { customerName } from "../data.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import { useStore } from "../store.tsx";
import { DemoModuleBanner } from "../ui/DemoModuleBanner.tsx";
import { PageToolbar } from "../ui/PageToolbar.tsx";

const statusClass: Record<RateSearchRow["status"], string> = {
  ACTIVE: "pill-ok",
  EXPIRING_SOON: "pill-warn",
  EXPIRED: "pill-bad",
};

export function RatesPage() {
  const { tx, locale, customers } = useStore();
  const { mode, user } = useAuth();
  const navigate = useNavigate();
  const isDemo = mode === "demo";
  const [form, setForm] = useState({ origin: "Shanghai", destination: "Laem Chabang", containerType: "40HC", mode: "SEA_FCL" });
  const [rows, setRows] = useState<RateSearchRow[]>(isDemo ? demoRates : []);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [quoteCustomer, setQuoteCustomer] = useState(customers[0]?.id ?? "c1");
  const [qty, setQty] = useState(2);

  const canSeeBuy = !isDemo && (user?.permissions.includes("rate.view_buy") || user?.permissions.includes("rate.buy.view"));
  const canSeeMargin = !isDemo && (user?.permissions.includes("margin.view") || user?.permissions.includes("finance.margin.view"));

  const load = useCallback(async () => {
    if (isDemo) {
      setRows(
        demoRates.filter(
          (r) =>
            r.origin.toLowerCase().includes(form.origin.toLowerCase()) &&
            r.destination.toLowerCase().includes(form.destination.toLowerCase()) &&
            r.containerType === form.containerType,
        ),
      );
      return;
    }
    if (mode !== "production" || !user) return;
    setLoading(true);
    setErr(null);
    try {
      const items = await searchRates(form);
      setRows(items);
    } catch {
      setErr(tx("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [form, isDemo, mode, user, tx]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createQuote(laneId: string) {
    if (isDemo) return;
    try {
      const result = (await createQuotationFromRate({ customerId: quoteCustomer, rateLaneId: laneId, quantity: qty })) as {
        id: string;
      };
      navigate(`/quotations?id=${result.id}`);
    } catch {
      setErr(tx("errorSave"));
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void load();
  }

  return (
    <div className="page page--workspace">
      <PageToolbar title={tx("ratesTitle")} count={rows.length} hint={isDemo ? tx("ratesDemoPreviewHint") : tx("ratesHint")} />
      {isDemo ? <DemoModuleBanner /> : null}

      <form className="form filter-form pipe-form" onSubmit={submit}>
        <label>
          {tx("colOrigin")}
          <input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} />
        </label>
        <label>
          {tx("colDest")}
          <input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
        </label>
        <label>
          {tx("colBoxType")}
          <select value={form.containerType} onChange={(e) => setForm({ ...form, containerType: e.target.value })}>
            {["20GP", "40GP", "40HC", "45HC"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {!isDemo ? (
          <>
            <label>
              {tx("colCustomer")}
              <select value={quoteCustomer} onChange={(e) => setQuoteCustomer(e.target.value)}>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {customerName(c, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tx("colQty")}
              <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            </label>
          </>
        ) : null}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? tx("loading") : tx("searchRates")}
          </button>
        </div>
      </form>

      {err ? <p className="form-err">{err}</p> : null}
      {isDemo ? <p className="meta">{tx("demoSampleData")}</p> : null}

      <div className="table-shell">
        <table className="data-table ledger">
          <thead>
            <tr>
              <th>{tx("colCarrier")}</th>
              <th>{tx("colLane")}</th>
              <th>{tx("colBoxType")}</th>
              {canSeeBuy ? <th>{tx("colBuy")}</th> : null}
              <th>{tx("colSell")}</th>
              {canSeeMargin ? <th>{tx("colMargin")}</th> : null}
              <th>{tx("colStatus")}</th>
              {!isDemo ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.laneId}>
                <td>{r.carrier ?? r.vendor}</td>
                <td>
                  {r.origin} → {r.destination}
                  <span className="meta block">{r.pol} → {r.pod}</span>
                </td>
                <td>{r.containerType}</td>
                {canSeeBuy ? <td className="mono">{r.totalBuy ? `${r.totalBuy} ${r.currency}` : "—"}</td> : null}
                <td className="mono">{r.totalSell ? `${r.totalSell} ${r.currency}` : "—"}</td>
                {canSeeMargin ? (
                  <td className="mono">{r.marginPct ? `${r.marginPct}%` : "—"}</td>
                ) : null}
                <td>
                  <span className={`pill ${statusClass[r.status]}`}>{r.status}</span>
                </td>
                {!isDemo ? (
                  <td>
                    <button type="button" className="btn btn-ghost btn-slim" onClick={() => void createQuote(r.laneId)}>
                      {tx("createQuote")}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
