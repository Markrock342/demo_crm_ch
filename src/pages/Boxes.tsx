import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { customerName, type BoxStatus, type Direction } from "../data";
import { useStore } from "../store";

const statuses: BoxStatus[] = ["yard", "sail", "clear", "hold", "empty"];

export function BoxesPage() {
  const { tx, locale, boxes, customers, query, addBox, setBoxStatus } = useStore();
  const [params] = useSearchParams();
  const q = (params.get("q") ?? query).trim().toLowerCase();
  const preset = (params.get("status") as BoxStatus | null) ?? "all";
  const [status, setStatus] = useState<BoxStatus | "all">(preset === "hold" ? "hold" : "all");
  const [dir, setDir] = useState<Direction | "all">("all");
  const [open, setOpen] = useState(false);
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
        const blob = `${b.id} ${b.bl} ${b.yardZh} ${c ? customerName(c, locale) : ""}`.toLowerCase();
        if (q && !blob.includes(q)) return false;
        if (status !== "all" && b.status !== status) return false;
        if (dir !== "all" && b.dir !== dir) return false;
        return true;
      }),
    [boxes, customers, dir, locale, q, status],
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const fail = addBox(form);
    if (fail) {
      setErr(tx(fail));
      return;
    }
    setErr(null);
    setForm({ ...form, id: "", bl: "" });
    setOpen(false);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{tx("boxesTitle")}</h1>
          <p>{tx("boxesHint")}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {tx("addBox")}
        </button>
      </div>

      <div className="toolbar">
        <div className="filters" role="group" aria-label={tx("colStatus")}>
          <button type="button" aria-pressed={status === "all"} onClick={() => setStatus("all")}>
            {tx("filterAll")}
          </button>
          {statuses.map((s) => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
              {tx(`st${cap(s)}`)}
            </button>
          ))}
        </div>
        <div className="filters" role="group" aria-label={tx("filterDir")}>
          <button type="button" aria-pressed={dir === "all"} onClick={() => setDir("all")}>
            {tx("filterAll")}
          </button>
          <button type="button" aria-pressed={dir === "in"} onClick={() => setDir("in")}>
            {tx("inboundShort")}
          </button>
          <button type="button" aria-pressed={dir === "out"} onClick={() => setDir("out")}>
            {tx("outboundShort")}
          </button>
        </div>
      </div>

      {open ? (
        <form className="form" onSubmit={submit} noValidate>
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

      {rows.length === 0 ? (
        <p className="empty">{tx("noMatch")}</p>
      ) : (
        <div className="table-wrap">
          <table>
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
                  <tr key={b.id}>
                    <td className="mono">{b.id}</td>
                    <td>{c ? customerName(c, locale) : "—"}</td>
                    <td>{b.type}</td>
                    <td>{tx(b.dir === "in" ? "inboundShort" : "outboundShort")}</td>
                    <td>
                      <label className="sr-only" htmlFor={`st-${b.id}`}>
                        {tx("pickStatus")}
                      </label>
                      <select
                        id={`st-${b.id}`}
                        className={`status-select pill-${b.status}`}
                        value={b.status}
                        onChange={(e) => setBoxStatus(b.id, e.target.value as BoxStatus)}
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
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
