import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DocStatus } from "../crm";
import { customerName } from "../data";
import { useStore } from "../store";
import { Segment } from "../ui/Segment";

const statuses: Array<DocStatus | "all"> = ["all", "ok", "wait", "late"];

export function DocsPage() {
  const { tx, locale, docs, customers, query } = useStore();
  const navigate = useNavigate();
  const [status, setStatus] = useState<DocStatus | "all">("all");
  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      docs.filter((d) => {
        if (status !== "all" && d.status !== status) return false;
        const c = customers.find((x) => x.id === d.customerId);
        const blob = `${d.name} ${d.kind} ${d.boxId} ${c ? customerName(c, locale) : ""}`.toLowerCase();
        return !q || blob.includes(q);
      }),
    [customers, docs, locale, q, status],
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{tx("docsTitle")}</h1>
          <p>{tx("docsHint")}</p>
        </div>
      </div>
      <Segment
        label={tx("colStatus")}
        value={status}
        onChange={setStatus}
        options={statuses.map((s) => ({ value: s, label: s === "all" ? tx("filterAll") : s }))}
      />
      {rows.length === 0 ? (
        <p className="empty">{tx("emptyDocs")}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tx("colFile")}</th>
                <th>{tx("colKind")}</th>
                <th>{tx("colBox")}</th>
                <th>{tx("colCustomer")}</th>
                <th>{tx("colStatus")}</th>
                <th className="num">{tx("colUpdated")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const c = customers.find((x) => x.id === d.customerId);
                return (
                  <tr key={d.id} onClick={() => navigate(`/customers/${d.customerId}`)}>
                    <td>{d.name}</td>
                    <td className="mono">{d.kind}</td>
                    <td className="mono">{d.boxId}</td>
                    <td>{c ? customerName(c, locale) : "—"}</td>
                    <td>
                      <span className={`pill pill-${d.status === "ok" ? "clear" : d.status === "late" ? "hold" : "yard"}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="num">{d.updated}</td>
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
