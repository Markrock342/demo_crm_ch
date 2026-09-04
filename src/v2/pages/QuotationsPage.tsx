import type { ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { Button } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { customerName, type Customer } from "../../data";
import type { QuotationRow } from "../../api/commercial.ts";
import { useShellCrm } from "../../shell/crmStore.tsx";
import { useShellQuotes } from "../../shell/quoteStore.tsx";
import { useStore } from "../../store";
import { PageHeader } from "../components/PageHeader.tsx";
import { StatusTag } from "../components/StatusTag.tsx";
import { useAppMode } from "../hooks/useAppMode.ts";
import { useLiveQuotations } from "../hooks/useCommercial.ts";

export function QuotationsPageV2() {
  const { shell, live } = useAppMode();
  const { tx, locale } = useStore();
  const crm = useShellCrm();
  const quoteStore = useShellQuotes();
  const liveQ = useLiveQuotations();
  const navigate = useNavigate();

  const shellRows: QuotationRow[] = quoteStore.quotations.map((q) => ({
    id: q.id,
    quotationNumber: q.quotationNumber,
    customerId: q.customerId,
    origin: q.origin,
    destination: q.destination,
    pol: q.pol,
    pod: q.pod,
    mode: q.mode,
    containerType: q.containerType,
    quantity: q.quantity,
    currency: q.currency,
    status: q.status,
    currentRevision: q.revision,
    validUntil: q.validUntil ?? null,
  }));

  const rows = shell ? shellRows : (liveQ.data ?? []);

  const columns: ProColumns<QuotationRow>[] = [
    { title: "Quote", dataIndex: "quotationNumber", width: 140 },
    {
      title: tx("colCustomer"),
      dataIndex: "customerId",
      render: (_, r) => {
        const c = crm.customers.find((x) => x.id === r.customerId);
        return c ? customerName(c as Customer, locale) : r.customerId;
      },
    },
    {
      title: "Lane",
      render: (_, r) => `${r.pol}→${r.pod}`,
    },
    { title: tx("colStatus"), dataIndex: "status", render: (_, r) => <StatusTag status={String(r.status)} /> },
    { title: "Rev", dataIndex: "currentRevision", width: 60 },
    { title: "Valid", dataIndex: "validUntil", width: 100 },
  ];

  return (
    <div style={{ padding: "0 8px 24px" }}>
      <PageHeader
        title={tx("quotationsTitle")}
        subtitle={`${rows.length} · ${shell ? tx("shellDataBadge") : live ? tx("liveApiBadge") : tx("quotationsDemoHint")}`}
        extra={
          shell || live ? (
            <Link to="/quotations/new">
              <Button type="primary">{tx("quoteWizardTitle")}</Button>
            </Link>
          ) : null
        }
      />
      {!shell && !live ? <p>{tx("apiNotConfigured")}</p> : null}
      {(shell || live) && (
        <ProTable<QuotationRow>
          rowKey="id"
          loading={live && liveQ.isLoading}
          columns={columns}
          dataSource={rows}
          search={false}
          pagination={{ pageSize: 20 }}
          onRow={(r) => ({ style: { cursor: "pointer" }, onClick: () => navigate(`/quotations/new?quote=${r.id}`) })}
        />
      )}
    </div>
  );
}
