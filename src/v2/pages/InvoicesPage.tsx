import type { ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { Link } from "react-router-dom";
import { Col, Row } from "antd";
import { customerName, type Customer } from "../../data";
import type { InvoiceRow } from "../../api/commercial.ts";
import { useShellBilling } from "../../shell/billingStore.tsx";
import { useShellCrm } from "../../shell/crmStore.tsx";
import { useStore } from "../../store";
import { PageHeader } from "../components/PageHeader.tsx";
import { AiBriefCard } from "../components/AiBriefCard.tsx";
import { Money } from "../components/Money.tsx";
import { StatusTag } from "../components/StatusTag.tsx";
import { useAppMode } from "../hooks/useAppMode.ts";
import { useLiveInvoices } from "../hooks/useCommercial.ts";

export function InvoicesPageV2() {
  const { shell, live } = useAppMode();
  const { tx, locale } = useStore();
  const crm = useShellCrm();
  const billing = useShellBilling();
  const liveInv = useLiveInvoices();
  const localeTag = locale === "zh" ? "zh-CN" : locale === "th" ? "th-TH" : "en-US";

  const shellRows: InvoiceRow[] = billing.invoices.map((i) => ({
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    customerId: i.customerId,
    jobId: i.jobId ?? null,
    total: String(i.total),
    balanceDue: String(i.balanceDue),
    paidAmount: "0",
    currency: i.currency,
    status: i.status,
    dueDate: i.dueDate ?? "",
  }));

  const rows = shell ? shellRows : (liveInv.data ?? []);

  const arFacts = {
    invoices: rows.length,
    openBalance: rows.filter((r) => parseFloat(r.balanceDue) > 0).length,
    draft: rows.filter((r) => r.status === "DRAFT").length,
    paid: rows.filter((r) => r.status === "PAID").length,
  };
  const arLocal = `AR: ${rows.length} invoices, ${arFacts.openBalance} with balance due, ${arFacts.draft} drafts.`;

  const columns: ProColumns<InvoiceRow>[] = [
    { title: "Invoice", dataIndex: "invoiceNumber", width: 140 },
    {
      title: tx("colCustomer"),
      dataIndex: "customerId",
      render: (_, r) => {
        const c = crm.customers.find((x) => x.id === r.customerId);
        return c ? customerName(c as Customer, locale) : r.customerId;
      },
    },
    {
      title: "Job",
      dataIndex: "jobId",
      render: (id) => (id ? <Link to={`/jobs/${id}`}>{id}</Link> : "—"),
    },
    { title: tx("colStatus"), dataIndex: "status", render: (_, r) => <StatusTag status={String(r.status)} /> },
    {
      title: "Total",
      dataIndex: "total",
      align: "right",
      render: (_, r) => <Money amount={parseFloat(r.total)} currency={r.currency} locale={localeTag} />,
    },
    {
      title: "Balance",
      dataIndex: "balanceDue",
      align: "right",
      render: (_, r) => <Money amount={parseFloat(r.balanceDue)} currency={r.currency} locale={localeTag} />,
    },
    { title: tx("invoiceDueDate"), dataIndex: "dueDate", render: (d) => String(d).slice(0, 10) },
  ];

  return (
    <div style={{ padding: "0 8px 24px" }}>
      <PageHeader
        title={tx("navInvoices")}
        subtitle={`${rows.length} · ${shell ? tx("shellDataBadge") : live ? tx("liveApiBadge") : tx("apiNotConfigured")}`}
      />
      {(shell || live) && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24}>
            <AiBriefCard title={tx("aiMgmtReport")} facts={arFacts} localFallback={arLocal} compact />
          </Col>
        </Row>
      )}
      {!shell && !live ? <p>{tx("apiNotConfigured")}</p> : null}
      {(shell || live) && (
        <ProTable<InvoiceRow>
          rowKey="id"
          loading={live && liveInv.isLoading}
          columns={columns}
          dataSource={rows}
          search={false}
          pagination={{ pageSize: 20 }}
        />
      )}
    </div>
  );
}
