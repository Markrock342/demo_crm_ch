import type { ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { Link } from "react-router-dom";
import { useMemo } from "react";
import { customerName, type Customer } from "../../data";
import { isBeforeToday } from "../../lib/dates.ts";
import { useShellBilling } from "../../shell/billingStore.tsx";
import { useShellCrm } from "../../shell/crmStore.tsx";
import { useShellJobs } from "../../shell/jobStore.tsx";
import { useShellOps } from "../../shell/opsStore.tsx";
import { useShellSupport } from "../../shell/supportStore.tsx";
import { useStore } from "../../store";
import { PageHeader } from "../components/PageHeader.tsx";
import { useAppMode } from "../hooks/useAppMode.ts";
import { useLiveInvoices } from "../hooks/useCommercial.ts";

type Exc = { id: string; kind: string; label: string; meta: string; to: string };

export function ExceptionsPageV2() {
  const { tx, locale } = useStore();
  const { shell, live, enabled } = useAppMode();
  const jobs = useShellJobs();
  const ops = useShellOps();
  const billing = useShellBilling();
  const support = useShellSupport();
  const crm = useShellCrm();
  const liveInv = useLiveInvoices();

  const rows = useMemo(() => {
    const list: Exc[] = [];
    for (const j of jobs.jobs) {
      if (j.delayed) list.push({ id: `delay-${j.id}`, kind: "ETA delayed", label: j.jobNumber, meta: `${j.pol}→${j.pod}`, to: `/jobs/${j.id}` });
      if (j.status !== "CLOSED" && !j.opsOwner.trim()) {
        list.push({ id: `ops-${j.id}`, kind: "No ops owner", label: j.jobNumber, meta: j.customerId, to: `/jobs/${j.id}` });
      }
    }
    if (shell) {
      for (const d of support.docs) {
        if (d.status === "late" || d.status === "wait") {
          list.push({ id: `doc-${d.id}`, kind: "Missing document", label: `${d.docType} · ${d.name}`, meta: d.note || d.status, to: d.jobId ? `/jobs/${d.jobId}` : "/docs?missing=1" });
        }
      }
      for (const inv of billing.invoices) {
        if (inv.overdue || (inv.balanceDue > 0 && inv.dueDate && isBeforeToday(inv.dueDate) && inv.status !== "PAID" && inv.status !== "DRAFT")) {
          const c = crm.customers.find((x) => x.id === inv.customerId);
          list.push({ id: `inv-${inv.id}`, kind: "Invoice overdue", label: inv.invoiceNumber, meta: c ? customerName(c as Customer, locale) : inv.customerId, to: inv.jobId ? `/jobs/${inv.jobId}` : "/invoices" });
        }
      }
      for (const b of ops.boxes) {
        if (b.demurrageRisk === "risk" || b.demurrageRisk === "watch") {
          list.push({ id: `box-${b.id}`, kind: "Container risk", label: b.id, meta: b.demurrageRisk ?? "", to: `/boxes?q=${b.id}` });
        }
      }
    }
    if (live && liveInv.data) {
      for (const inv of liveInv.data) {
        if (parseFloat(inv.balanceDue) > 0 && inv.dueDate && isBeforeToday(String(inv.dueDate).slice(0, 10)) && inv.status !== "PAID" && inv.status !== "DRAFT") {
          list.push({ id: `inv-${inv.id}`, kind: "Invoice overdue", label: inv.invoiceNumber, meta: inv.customerId, to: inv.jobId ? `/jobs/${inv.jobId}` : "/invoices" });
        }
      }
    }
    return list;
  }, [billing.invoices, crm.customers, jobs.jobs, live, liveInv.data, locale, ops.boxes, shell, support.docs]);

  const columns: ProColumns<Exc>[] = [
    { title: tx("exceptionKind"), dataIndex: "kind", width: 140 },
    { title: "Ref", dataIndex: "label", render: (_, r) => <Link to={r.to}>{r.label}</Link> },
    { title: "Detail", dataIndex: "meta", ellipsis: true },
    { title: "", valueType: "option", width: 80, render: (_, r) => [<Link key="o" to={r.to}>{tx("exceptionOpen")}</Link>] },
  ];

  if (!enabled) {
    return (
      <div style={{ padding: 24 }}>
        <PageHeader title={tx("navActionCenter")} subtitle={tx("apiNotConfigured")} />
      </div>
    );
  }

  return (
    <div style={{ padding: "0 8px 24px" }}>
      <PageHeader title={tx("navActionCenter")} subtitle={`${rows.length} · ${shell ? tx("shellDataBadge") : tx("liveApiBadge")}`} />
      <ProTable<Exc> rowKey="id" columns={columns} dataSource={rows} search={false} pagination={{ pageSize: 20 }} />
    </div>
  );
}
