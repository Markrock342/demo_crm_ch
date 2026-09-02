import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { customerName, type Box, type BoxStatus, type Direction } from "../data";
import { useContainers } from "../hooks/useContainers";
import { useStore } from "../store";
import { BoxLedgerCards } from "../ui/BoxLedgerCards";
import { PageToolbar } from "../ui/PageToolbar";
import { useMedia } from "../ui/useMedia";

const statuses: BoxStatus[] = ["yard", "sail", "clear", "hold", "empty"];

export function BoxesPage() {
  const { tx, locale, customers, docs, shipments, query } = useStore();
  const { boxes, addBox, setBoxStatus, err: containerErr } = useContainers();
  const mobile = useMedia("(max-width: 1024px)");
  const [params] = useSearchParams();
  const q = (params.get("q") ?? query).trim().toLowerCase();
  const preset = (params.get("status") as BoxStatus | null) ?? "all";
  const [status, setStatus] = useState<BoxStatus | "all">(preset === "hold" ? "hold" : "all");
  const [dir, setDir] = useState<Direction | "all">("all");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Box | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    id: "",
    customerId: customers[0]?.id ?? "",
    type: "40HC",
    dir: "out" as Direction,
    status: "yard" as BoxStatus,
    yardZh: "林查班 B4",
    eta: "09-10",
    bl: "",
    teu: 2,
  });

  const rows = useMemo(
    () =>
      boxes.filter((b) => {
        const c = customers.find((x) => x.id === b.customerId);
        const blob = `${b.id} ${b.bl} ${b.yardZh} ${b.vessel ?? ""} ${c ? customerName(c, locale) : ""}`.toLowerCase();
        if (q && !blob.includes(q)) return false;
        if (status !== "all" && b.status !== status) return false;
        if (dir !== "all" && b.dir !== dir) return false;
        return true;
      }),
    [boxes, customers, dir, locale, q, status],
  );

  const active = selected && rows.some((b) => b.id === selected.id) ? boxes.find((b) => b.id === selected.id) ?? null : null;
  const linkedDocs = active ? docs.filter((d) => d.boxId === active.id) : [];
  const shipment = active?.shipmentId ? shipments.find((s) => s.id === active.shipmentId) : shipments.find((s) => s.bl === active?.bl);

  function submit(e: FormEvent) {
    e.preventDefault();
    void (async () => {
      const fail = await addBox(form);
      if (fail) {
        setErr(tx(fail));
        return;
      }
      setErr(null);
      setForm({ ...form, id: "", bl: "" });
      setOpen(false);
    })();
  }

  const statusCounts = useMemo(() => {
    const map: Record<BoxStatus | "all", number> = { all: boxes.length, yard: 0, sail: 0, clear: 0, hold: 0, empty: 0 };
    for (const b of boxes) map[b.status] += 1;
    return map;
  }, [boxes]);

  return (
    <div className={`page page--workspace${active ? " page--with-drawer" : ""}`}>
      <PageToolbar
        title={tx("boxesTitle")}
        count={rows.length}
        hint={tx("boxesHint")}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {tx("addBox")}
          </button>
        }
        filters={
          <>
            <div className="filter-row" role="group" aria-label={tx("colStatus")}>
              <button type="button" aria-pressed={status === "all"} className={`filter-chip${status === "all" ? " is-on" : ""}`} onClick={() => setStatus("all")}>
                <span>{tx("filterAll")}</span>
                <em>{statusCounts.all}</em>
              </button>
              {statuses.map((s) => (
                <button key={s} type="button" aria-pressed={status === s} className={`filter-chip${status === s ? " is-on" : ""}`} onClick={() => setStatus(s)}>
                  <span>{tx(`st${cap(s)}`)}</span>
                  <em>{statusCounts[s]}</em>
                </button>
              ))}
            </div>
            <div className="filter-row" role="group" aria-label={tx("filterDir")}>
              <button type="button" aria-pressed={dir === "all"} className={`filter-chip${dir === "all" ? " is-on" : ""}`} onClick={() => setDir("all")}>
                <span>{tx("filterAll")}</span>
              </button>
              <button type="button" aria-pressed={dir === "in"} className={`filter-chip${dir === "in" ? " is-on" : ""}`} onClick={() => setDir("in")}>
                <span>{tx("inboundShort")}</span>
              </button>
              <button type="button" aria-pressed={dir === "out"} className={`filter-chip${dir === "out" ? " is-on" : ""}`} onClick={() => setDir("out")}>
                <span>{tx("outboundShort")}</span>
              </button>
            </div>
          </>
        }
      />

      {containerErr ? <p className="meta form-err">{containerErr}</p> : null}

      {open ? (
        <form className="form form-stack" onSubmit={submit} noValidate>
          <label>
            {tx("boxNo")}
            <input
              value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value })}
              placeholder="MSCU4829103"
              required
              aria-invalid={!!err}
            />
          </label>
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
            {tx("colType")}
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option>40HC</option>
              <option>20GP</option>
              <option>40GP</option>
            </select>
          </label>
          <label>
            {tx("colDir")}
            <select value={form.dir} onChange={(e) => setForm({ ...form, dir: e.target.value as Direction })}>
              <option value="in">{tx("inboundShort")}</option>
              <option value="out">{tx("outboundShort")}</option>
            </select>
          </label>
          <label>
            {tx("colYard")}
            <input value={form.yardZh} onChange={(e) => setForm({ ...form, yardZh: e.target.value })} />
          </label>
          <label>
            {tx("bl")}
            <input value={form.bl} onChange={(e) => setForm({ ...form, bl: e.target.value })} />
          </label>
          <div className="form-actions">
            {err ? (
              <p className="field-err" role="alert">
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

      <div className={`boxes-layout${active && !mobile ? " boxes-layout--drawer" : ""}`}>
        {rows.length === 0 ? (
          <p className="empty">{tx("noMatch")}</p>
        ) : mobile ? (
          <BoxLedgerCards
            boxes={rows}
            customers={customers}
            locale={locale}
            onOpen={(b) => setSelected(b)}
            onStatusChange={setBoxStatus}
          />
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tx("colBox")}</th>
                  <th>{tx("colCustomer")}</th>
                  <th>{tx("colType")}</th>
                  <th>{tx("colDir")}</th>
                  <th>{tx("colStatus")}</th>
                  <th>{tx("colYard")}</th>
                  <th className="num">{tx("colTeu")}</th>
                  <th className="num">{tx("colEta")}</th>
                  <th>{tx("colBl")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const c = customers.find((x) => x.id === b.customerId);
                  return (
                    <tr
                      key={b.id}
                      className={active?.id === b.id ? "row-active" : undefined}
                      tabIndex={0}
                      onClick={() => setSelected(b)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setSelected(b);
                      }}
                    >
                      <td className="mono">{b.id}</td>
                      <td>{c ? customerName(c, locale) : "—"}</td>
                      <td>{b.type}</td>
                      <td>{tx(b.dir === "in" ? "inboundShort" : "outboundShort")}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <label className="sr-only" htmlFor={`st-${b.id}`}>
                          {tx("pickStatus")}
                        </label>
                        <select
                          id={`st-${b.id}`}
                          className={`status-select pill-${b.status}`}
                          value={b.status}
                          onChange={(e) => void setBoxStatus(b.id, e.target.value as BoxStatus)}
                        >
                          {statuses.map((s) => (
                            <option key={s} value={s}>
                              {tx(`st${cap(s)}`)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{locale === "th" ? b.yardTh : locale === "en" ? b.yardEn : b.yardZh}</td>
                      <td className="num">{b.teu}</td>
                      <td className="num">{b.eta}</td>
                      <td className="mono">{b.bl}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {active ? (
          <>
            {mobile ? (
              <button type="button" className="box-drawer-backdrop" aria-label={tx("closeMenu")} onClick={() => setSelected(null)} />
            ) : null}
            <aside className={`box-drawer${mobile ? " box-drawer--sheet" : ""}`} aria-label={tx("boxDetailTitle")}>
            <header className="box-drawer-head">
              <h2 className="mono">{active.id}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setSelected(null)}>
                {tx("closeMenu")}
              </button>
            </header>
            <dl className="box-facts">
              <div>
                <dt>{tx("colBl")}</dt>
                <dd className="mono">{active.bl || "—"}</dd>
              </div>
              <div>
                <dt>{tx("colVessel")}</dt>
                <dd>{active.vessel ?? shipment?.vessel ?? "—"}</dd>
              </div>
              <div>
                <dt>{tx("colLane")}</dt>
                <dd className="mono">
                  {active.pol ?? shipment?.pol ?? "—"} → {active.pod ?? shipment?.pod ?? "—"}
                </dd>
              </div>
              <div>
                <dt>{tx("colSeal")}</dt>
                <dd className="mono">{active.seal ?? "—"}</dd>
              </div>
              <div>
                <dt>{tx("colCommodity")}</dt>
                <dd>{active.commodity ?? "—"}</dd>
              </div>
              {shipment ? (
                <div>
                  <dt>{tx("colBooking")}</dt>
                  <dd>
                    <Link to={`/shipments`}>{shipment.bookingNo}</Link>
                  </dd>
                </div>
              ) : null}
            </dl>
            <section>
              <h3>{tx("colLinkedDocs")}</h3>
              {linkedDocs.length === 0 ? (
                <p className="meta">{tx("emptyDocs")}</p>
              ) : (
                <ul className="box-doc-list">
                  {linkedDocs.map((d) => (
                    <li key={d.id}>
                      <span className="mono">{d.kind}</span> {d.name}
                      <span className={`pill pill-${d.status === "ok" ? "clear" : d.status === "late" ? "hold" : "yard"}`}>
                        {tx(`doc${cap(d.status)}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
          </>
        ) : null}
      </div>
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
