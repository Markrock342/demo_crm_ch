import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  approveQuotation,
  createBookingFromQuote,
  createJobFromBooking,
  fetchBookingsForQuote,
  fetchQuotation,
  fetchQuotations,
  quotationPdfUrl,
  sendQuotation,
  submitQuotationApproval,
  type QuotationRow,
} from "../api/commercial.ts";
import { demoQuotationDetail, demoQuotations, type DemoQuoteDetail } from "../demo/commercial-demo.ts";
import { customerName } from "../data.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import { useStore } from "../store.tsx";
import { DemoModuleBanner } from "../ui/DemoModuleBanner.tsx";
import { PageToolbar } from "../ui/PageToolbar.tsx";

type QuoteDetail = DemoQuoteDetail;

export function QuotationsPage() {
  const { tx, locale, customers } = useStore();
  const { mode, user } = useAuth();
  const isDemo = mode === "demo";
  const [params] = useSearchParams();
  const [rows, setRows] = useState<QuotationRow[]>(isDemo ? demoQuotations : []);
  const [detail, setDetail] = useState<QuoteDetail | null>(
    isDemo ? demoQuotationDetail(params.get("id") ?? demoQuotations[0]?.id ?? "") : null,
  );
  const [selected, setSelected] = useState<string | null>(params.get("id") ?? (isDemo ? demoQuotations[0]?.id ?? null : null));
  const [publicLink, setPublicLink] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Array<{ id: string; bookingNumber: string }>>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const canApprove = user?.permissions.includes("quotation.approve");
  const canSend = user?.permissions.includes("quotation.send");

  const loadList = useCallback(async () => {
    if (isDemo) {
      setRows(demoQuotations);
      return;
    }
    if (mode !== "production" || !user) return;
    const items = await fetchQuotations();
    setRows(items);
  }, [isDemo, mode, user]);

  const loadDetail = useCallback(
    async (id: string) => {
      if (isDemo) {
        setDetail(demoQuotationDetail(id));
        setSelected(id);
        return;
      }
      const d = (await fetchQuotation(id)) as QuoteDetail;
      setDetail(d);
      setSelected(id);
      const bks = await fetchBookingsForQuote(id).catch(() => []);
      setBookings(bks);
    },
    [isDemo],
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    const id = params.get("id");
    if (id) void loadDetail(id);
    else if (isDemo && demoQuotations[0]) void loadDetail(demoQuotations[0].id);
  }, [params, isDemo, loadDetail]);

  const customerMap = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);

  async function act(fn: () => Promise<unknown>, okKey: string) {
    try {
      await fn();
      setMsg(tx(okKey));
      if (selected) await loadDetail(selected);
      await loadList();
    } catch {
      setMsg(tx("errorSave"));
    }
  }

  return (
    <div className="page page--workspace page--split">
      <PageToolbar
        title={tx("quotationsTitle")}
        count={rows.length}
        hint={isDemo ? tx("quotationsDemoPreviewHint") : tx("quotationsHint")}
      />
      {isDemo ? <DemoModuleBanner /> : null}
      {msg ? <p className="meta">{msg}</p> : null}

      <div className="split-panels">
        <div className="panel">
          <h2>{tx("quotationsList")}</h2>
          <ul className="list-plain">
            {rows.map((q) => (
              <li key={q.id}>
                <button type="button" className={`list-btn${selected === q.id ? " is-active" : ""}`} onClick={() => void loadDetail(q.id)}>
                  <strong>{q.quotationNumber}</strong>
                  <span className="meta">{customerMap[q.customerId] ? customerName(customerMap[q.customerId], locale) : q.customerId}</span>
                  <span className={`pill ${q.status === "ACCEPTED" ? "pill-ok" : ""}`}>{q.status}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          {detail ? (
            <>
              <h2>{detail.quotation.quotationNumber} Rev.{detail.quotation.currentRevision}</h2>
              <p>
                {detail.quotation.origin} → {detail.quotation.destination} · {detail.quotation.pol} → {detail.quotation.pod}
              </p>
              <p className="meta">
                {detail.quotation.mode} · {detail.quotation.containerType} × {detail.quotation.quantity} · {detail.quotation.status}
              </p>
              {isDemo ? <p className="meta">{tx("demoSampleData")}</p> : null}
              {detail.totals ? (
                <div className="kpi-row">
                  {detail.totals.totalBuy ? (
                    <div className="kpi">
                      <span>{tx("colBuy")}</span>
                      <strong>{detail.totals.totalBuy}</strong>
                    </div>
                  ) : null}
                  <div className="kpi">
                    <span>{tx("colSell")}</span>
                    <strong>{detail.totals.totalSell}</strong>
                  </div>
                  {detail.totals.marginPct ? (
                    <div className="kpi">
                      <span>{tx("colMargin")}</span>
                      <strong>{detail.totals.marginPct}%</strong>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <ul className="list-plain">
                {detail.charges.map((c, i) => (
                  <li key={i}>
                    {c.description} — {c.sellAmount} {c.currency}
                  </li>
                ))}
              </ul>
              {!isDemo ? (
                <div className="toolbar">
                  <a className="btn btn-ghost" href={quotationPdfUrl(detail.quotation.id)} target="_blank" rel="noreferrer">
                    PDF
                  </a>
                  {detail.quotation.status === "DRAFT" ? (
                    <button type="button" className="btn btn-ghost" onClick={() => void act(() => submitQuotationApproval(detail.quotation.id), "quoteSubmitted")}>
                      {tx("submitApproval")}
                    </button>
                  ) : null}
                  {canApprove && detail.quotation.status === "PENDING_APPROVAL" ? (
                    <>
                      <button type="button" className="btn btn-primary" onClick={() => void act(() => approveQuotation(detail.quotation.id, "APPROVED"), "quoteApproved")}>
                        {tx("approve")}
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => void act(() => approveQuotation(detail.quotation.id, "REJECTED"), "quoteRejected")}>
                        {tx("reject")}
                      </button>
                    </>
                  ) : null}
                  {canSend && ["APPROVED", "DRAFT"].includes(detail.quotation.status) ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() =>
                        void act(async () => {
                          const r = (await sendQuotation(detail.quotation.id)) as { publicUrl: string };
                          setPublicLink(r.publicUrl);
                        }, "quoteSent")
                      }
                    >
                      {tx("sendQuote")}
                    </button>
                  ) : null}
                  {detail.quotation.status === "ACCEPTED" ? (
                    <button type="button" className="btn btn-primary" onClick={() => void act(() => createBookingFromQuote(detail.quotation.id), "bookingCreated")}>
                      {tx("createBooking")}
                    </button>
                  ) : null}
                  {bookings.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className="btn btn-ghost"
                      onClick={() =>
                        void act(async () => {
                          const r = (await createJobFromBooking(b.id)) as { id: string; jobNumber: string };
                          window.location.href = `/jobs?selected=${r.id}`;
                        }, "jobCreated")
                      }
                    >
                      {tx("createJob")} ({b.bookingNumber})
                    </button>
                  ))}
                </div>
              ) : null}
              {publicLink ? (
                <p className="meta">
                  {tx("publicLink")}: <a href={publicLink}>{publicLink}</a>
                </p>
              ) : null}
            </>
          ) : (
            <p className="meta">{tx("selectQuotation")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
