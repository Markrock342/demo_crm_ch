import { useMemo } from "react";
import { Link } from "react-router-dom";
import { customerName, type Customer } from "../data";
import { useShellBilling } from "../shell/billingStore.tsx";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useShellJobs } from "../shell/jobStore.tsx";
import { useShellOps } from "../shell/opsStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useShellSupport } from "../shell/supportStore.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

type Exc = { id: string; kind: string; label: string; meta: string; to: string };

export function ExceptionsPage() {
  const shell = useIsShellMode();
  const { tx, locale } = useStore();
  const jobs = useShellJobs();
  const ops = useShellOps();
  const billing = useShellBilling();
  const support = useShellSupport();
  const crm = useShellCrm();

  const rows = useMemo(() => {
    const list: Exc[] = [];
    for (const j of jobs.jobs) {
      if (j.delayed) {
        list.push({ id: `delay-${j.id}`, kind: "ETA delayed", label: j.jobNumber, meta: `${j.pol}→${j.pod}`, to: `/jobs/${j.id}` });
      }
      if (j.status !== "CLOSED" && !j.opsOwner.trim()) {
        list.push({ id: `ops-${j.id}`, kind: "No ops owner", label: j.jobNumber, meta: j.customerId, to: `/jobs/${j.id}` });
      }
    }
    for (const d of support.docs) {
      if (d.status === "late" || d.status === "wait") {
        list.push({
          id: `doc-${d.id}`,
          kind: d.docType === "CO" ? "C/O missing" : d.docType === "POD" ? "POD waiting" : "Missing document",
          label: `${d.docType} · ${d.name}`,
          meta: d.note || d.status,
          to: d.jobId ? `/jobs/${d.jobId}` : "/docs?missing=1",
        });
      }
    }
    for (const inv of billing.invoices) {
      if (inv.overdue || (inv.balanceDue > 0 && inv.dueDate && inv.dueDate < "2026-09-04" && inv.status !== "PAID" && inv.status !== "DRAFT")) {
        const c = crm.customers.find((x) => x.id === inv.customerId);
        list.push({
          id: `inv-${inv.id}`,
          kind: "Invoice overdue",
          label: inv.invoiceNumber,
          meta: c ? customerName(c as Customer, locale) : inv.customerId,
          to: inv.jobId ? `/jobs/${inv.jobId}` : "/invoices",
        });
      }
    }
    for (const b of ops.boxes) {
      if (b.demurrageRisk === "risk" || b.demurrageRisk === "watch") {
        const ship = ops.shipments.find((s) => s.id === b.shipmentId);
        list.push({
          id: `box-${b.id}`,
          kind: "Demurrage risk",
          label: b.id,
          meta: `${b.demurrageRisk} · LFD ${b.lastFreeDay ?? "—"}`,
          to: ship?.jobId ? `/jobs/${ship.jobId}` : "/boxes",
        });
      }
    }
    return list;
  }, [billing.invoices, crm.customers, jobs.jobs, locale, ops.boxes, ops.shipments, support.docs]);

  if (!shell) {
    return (
      <div className="page page--workspace">
        <PageToolbar title={tx("navExceptions")} hint={tx("apiNotConfigured")} />
      </div>
    );
  }

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("navExceptions")}
        count={rows.length}
        hint={`${tx("shellDataBadge")} · ${tx("exceptionsHint")}`}
        actions={
          <Link className="btn btn-ghost" to="/">
            {tx("navOverview")}
          </Link>
        }
      />
      {rows.length === 0 ? (
        <p className="empty">{tx("emptyShellCrm")}</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tx("exceptionKind")}</th>
                <th>{tx("colTitle")}</th>
                <th>{tx("colStatus")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="pill pill-warn">{r.kind}</span>
                  </td>
                  <td className="cell-strong">{r.label}</td>
                  <td className="meta">{r.meta}</td>
                  <td>
                    <Link to={r.to}>{tx("exceptionOpen")}</Link>
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
