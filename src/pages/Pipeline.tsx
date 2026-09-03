import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { dealStageI18n, dealStages, money, nextDealStage, type DealStage } from "../crm";
import { customerName, type Customer } from "../data";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useStore } from "../store";
import { Button } from "../ui/Button";
import { PageToolbar } from "../ui/PageToolbar";
import { useMedia } from "../ui/useMedia";

const dealFormInitial = (customerId: string) => ({
  customerId,
  title: "",
  lane: "",
  value: 40000,
  teu: 4,
  close: "09-28",
  owner: "shell",
});

export function PipelinePage() {
  const shell = useIsShellMode();
  const store = useStore();
  const crm = useShellCrm();
  const { tx, locale } = store;
  const deals = shell ? crm.deals : store.deals;
  const customers = shell ? crm.customers : store.customers;
  const moveDeal = shell ? crm.moveDeal : store.moveDeal;
  const addDeal = shell ? crm.addDeal : store.addDeal;
  const narrow = useMedia("(max-width: 640px)");
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<DealStage>(dealStages[0]);
  const boardRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState(dealFormInitial(""));

  useEffect(() => {
    if (!form.customerId && customers[0]?.id) {
      setForm((f) => ({ ...f, customerId: customers[0]!.id }));
    }
  }, [customers, form.customerId]);

  useEffect(() => {
    if (!narrow || !boardRef.current) return;
    const col = boardRef.current.querySelector(`[data-stage="${focus}"]`);
    col?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }, [focus, narrow]);

  function submit(e: FormEvent) {
    e.preventDefault();
    addDeal(form);
    setForm({ ...form, title: "" });
    setOpen(false);
  }

  const stages = narrow ? dealStages.filter((s) => s === focus) : dealStages;
  const openValue = deals.filter((d) => d.stage !== "billed").reduce((n, d) => n + d.value, 0);

  return (
    <div className="page page--workspace page--pipe">
      <PageToolbar
        title={tx("pipelineTitle")}
        count={deals.length}
        hint={shell ? tx("emptyShellCrm") : tx("pipelineHint")}
        actions={
          <Button variant="primary" onClick={() => setOpen((v) => !v)} aria-expanded={open} disabled={customers.length === 0}>
            {tx("shellCreateDeal")}
          </Button>
        }
        filters={
          narrow ? (
            <div className="pipe-tabs" role="tablist" aria-label={tx("pipelineTitle")}>
              {dealStages.map((stage) => {
                const n = deals.filter((d) => d.stage === stage).length;
                return (
                  <button
                    key={stage}
                    type="button"
                    role="tab"
                    aria-selected={focus === stage}
                    className={focus === stage ? "is-on" : ""}
                    onClick={() => setFocus(stage)}
                  >
                    {tx(dealStageI18n[stage])}
                    <span className="pipe-tab-n">{n}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="stat-strip">
              <div className="stat-chip">
                <span>{tx("dashOpenDeals")}</span>
                <strong>{money(openValue)}</strong>
              </div>
              {dealStages.map((stage) => (
                <div key={stage} className="stat-chip">
                  <span>{tx(dealStageI18n[stage])}</span>
                  <strong>{deals.filter((d) => d.stage === stage).length}</strong>
                </div>
              ))}
            </div>
          )
        }
      />

      {customers.length === 0 ? <p className="meta">{tx("quoteNeedCustomer")}</p> : null}

      <div className={`fold${open ? " is-open" : ""}`}>
        <div className="fold-inner">
          <form
            className="form form-stack pipe-form"
            onSubmit={submit}
            onReset={(e) => {
              e.preventDefault();
              setForm(dealFormInitial(customers[0]?.id ?? ""));
              setOpen(false);
            }}
            aria-hidden={!open}
          >
            <label>
              {tx("colCustomer")}
              <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {customerName(c as Customer, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tx("colTitle")}
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required={open} />
            </label>
            <label>
              {tx("colLane")}
              <input value={form.lane} onChange={(e) => setForm({ ...form, lane: e.target.value })} />
            </label>
            <label>
              {tx("colValue")}
              <input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
            </label>
            <label>
              {tx("colTeu")}
              <input type="number" value={form.teu} onChange={(e) => setForm({ ...form, teu: Number(e.target.value) })} />
            </label>
            <label>
              {tx("colClose")}
              <input value={form.close} onChange={(e) => setForm({ ...form, close: e.target.value })} />
            </label>
            <div className="form-actions">
              <Button type="reset">{tx("cancel")}</Button>
              <Button type="submit" variant="primary">
                {tx("save")}
              </Button>
            </div>
          </form>
        </div>
      </div>

      <div className="board-wrap">
        <div className="board" ref={boardRef} role="list">
          {stages.map((stage) => {
            const col = deals.filter((d) => d.stage === stage);
            const sum = col.reduce((n, d) => n + d.value, 0);
            return (
              <section key={stage} className="col" data-stage={stage} aria-label={tx(dealStageI18n[stage])}>
                <div className="col-head">
                  <h2>{tx(dealStageI18n[stage])}</h2>
                  <span className="num col-sum">{money(sum)}</span>
                </div>
                <div className="col-body">
                  {col.length === 0 ? <p className="empty-col">{tx("emptyPipe")}</p> : null}
                  {col.map((d) => {
                    const c = customers.find((x) => x.id === d.customerId);
                    const next = nextDealStage(d.stage as DealStage);
                    return (
                      <article key={d.id} className="deal" role="listitem">
                        <Link className="deal-open" to={`/customers/${d.customerId}`}>
                          <strong>{d.title}</strong>
                          <span>{c ? customerName(c as Customer, locale) : "—"}</span>
                        </Link>
                        <p className="deal-lane">{d.lane}</p>
                        <div className="deal-meta">
                          <span>
                            {d.teu} {tx("colTeu")}
                          </span>
                          <span className="num deal-value">{money(d.value)}</span>
                        </div>
                        <p className="deal-due">
                          {d.close} · {d.owner}
                        </p>
                        <div className="deal-actions">
                          <label className="sr-only" htmlFor={`st-${d.id}`}>
                            {tx("colStage")}
                          </label>
                          <select
                            id={`st-${d.id}`}
                            className="deal-select"
                            value={d.stage}
                            onChange={(e) => moveDeal(d.id, e.target.value)}
                          >
                            {dealStages.map((s) => (
                              <option key={s} value={s}>
                                {tx(dealStageI18n[s])}
                              </option>
                            ))}
                          </select>
                          {next ? (
                            <Button variant="slim" onClick={() => moveDeal(d.id, next)}>
                              {tx("moveStage")}
                            </Button>
                          ) : (
                            <span />
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
