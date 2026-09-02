import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DocStatus } from "../crm";
import { customerName } from "../data";
import { useStore } from "../store";
import { DocLedgerCards } from "../ui/DocLedgerCards";
import { PageToolbar } from "../ui/PageToolbar";
import { Button } from "../ui/Button";
import { useMedia } from "../ui/useMedia";

const statuses: Array<DocStatus | "all"> = ["all", "ok", "wait", "late"];
const docActions: DocStatus[] = ["ok", "wait", "late"];

export function DocsPage() {
  const { tx, locale, docs, customers, query, setDocStatus } = useStore();
  const navigate = useNavigate();
  const mobile = useMedia("(max-width: 1024px)");
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

  const counts = useMemo(() => {
    const map: Record<DocStatus | "all", number> = { all: docs.length, ok: 0, wait: 0, late: 0 };
    for (const d of docs) map[d.status] += 1;
    return map;
  }, [docs]);

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("docsTitle")}
        count={rows.length}
        hint={tx("docsHint")}
        filters={
          <div className="filter-row" role="tablist" aria-label={tx("colStatus")}>
            {statuses.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={status === s}
                className={`filter-chip${status === s ? " is-on" : ""}`}
                onClick={() => setStatus(s)}
              >
                <span>{s === "all" ? tx("filterAll") : tx(`doc${cap(s)}`)}</span>
                <em>{counts[s]}</em>
              </button>
            ))}
          </div>
        }
      />

      {rows.length === 0 ? (
        <p className="empty">{tx("emptyDocs")}</p>
      ) : mobile ? (
        <DocLedgerCards
          docs={rows}
          customers={customers}
          locale={locale}
          onOpenCustomer={(id) => navigate(`/customers/${id}`)}
          onOpenBox={(id) => navigate(`/boxes?q=${id}`)}
          onStatusChange={setDocStatus}
        />
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tx("colFile")}</th>
                <th>{tx("colKind")}</th>
                <th>{tx("colBox")}</th>
                <th>{tx("colCustomer")}</th>
                <th>{tx("colStatus")}</th>
                <th className="num">{tx("colUpdated")}</th>
                <th>{tx("docActions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const c = customers.find((x) => x.id === d.customerId);
                return (
                  <tr key={d.id}>
                    <td className="cell-strong" onClick={() => navigate(`/customers/${d.customerId}`)}>
                      {d.name}
                    </td>
                    <td className="mono" onClick={() => navigate(`/boxes?q=${d.boxId}`)}>
                      {d.kind}
                    </td>
                    <td className="mono" onClick={() => navigate(`/boxes?q=${d.boxId}`)}>
                      {d.boxId}
                    </td>
                    <td onClick={() => navigate(`/customers/${d.customerId}`)}>{c ? customerName(c, locale) : "—"}</td>
                    <td>
                      <span className={`pill pill-${d.status === "ok" ? "clear" : d.status === "late" ? "hold" : "yard"}`}>
                        {tx(`doc${cap(d.status)}`)}
                      </span>
                    </td>
                    <td className="num">{d.updated}</td>
                    <td>
                      <div className="doc-actions" onClick={(e) => e.stopPropagation()}>
                        {docActions.map((st) => (
                          <Button
                            key={st}
                            variant={d.status === st ? "primary" : "ghost"}
                            onClick={() => setDocStatus(d.id, st)}
                          >
                            {tx(`doc${cap(st)}`)}
                          </Button>
                        ))}
                      </div>
                    </td>
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
