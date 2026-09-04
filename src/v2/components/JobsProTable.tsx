import type { ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { Tag } from "antd";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { customerName, type Customer } from "../../data";
import { jobGrossProfit, type ShellJob } from "../../ports/job.port.ts";
import { useStore } from "../../store";
import { Money } from "./Money.tsx";
import { StatusTag } from "./StatusTag.tsx";

type Props = {
  rows: ShellJob[];
  customers: Customer[];
  loading?: boolean;
  error?: string | null;
  onReload?: () => void;
  extraToolbar?: React.ReactNode;
};

export function JobsProTable({ rows, customers, loading, error, onReload, extraToolbar }: Props) {
  const { tx, locale } = useStore();
  const navigate = useNavigate();

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  const columns: ProColumns<ShellJob>[] = [
    {
      title: tx("navJobs"),
      dataIndex: "jobNumber",
      fixed: "left",
      width: 140,
      copyable: true,
      render: (_, row) => (
        <>
          <strong>{row.jobNumber}</strong>
          {row.delayed ? (
            <Tag color="red" style={{ marginLeft: 6 }}>
              delay
            </Tag>
          ) : null}
        </>
      ),
    },
    {
      title: tx("colCustomer"),
      dataIndex: "customerId",
      width: 160,
      ellipsis: true,
      render: (_, row) => {
        const c = customerMap.get(row.customerId);
        return c ? customerName(c, locale) : row.customerId;
      },
    },
    {
      title: tx("jobParties"),
      dataIndex: "shipper",
      width: 180,
      ellipsis: true,
      search: false,
      render: (_, row) => `${row.shipper} / ${row.consignee}`,
    },
    {
      title: "Lane",
      dataIndex: "pol",
      width: 120,
      render: (_, row) => (
        <span style={{ fontFamily: "ui-monospace, monospace" }}>
          {row.pol}→{row.pod}
        </span>
      ),
    },
    {
      title: tx("colCarrier"),
      dataIndex: "carrier",
      width: 100,
      ellipsis: true,
    },
    {
      title: "Vessel / Voyage",
      dataIndex: "vessel",
      width: 140,
      search: false,
      render: (_, row) => {
        const vv = [row.vessel, row.voyage].filter(Boolean).join(" / ");
        return vv || "—";
      },
    },
    {
      title: tx("calEtd"),
      dataIndex: "etd",
      width: 88,
      search: false,
    },
    {
      title: tx("calEta"),
      dataIndex: "eta",
      width: 88,
      search: false,
    },
    {
      title: tx("jobOwners"),
      dataIndex: "salesOwner",
      width: 120,
      search: false,
      render: (_, row) => `${row.salesOwner || "—"} / ${row.opsOwner || "—"}`,
    },
    {
      title: tx("colStatus"),
      dataIndex: "status",
      width: 110,
      valueType: "select",
      valueEnum: {
        OPEN: { text: "OPEN" },
        IN_PROGRESS: { text: "IN_PROGRESS" },
        CLOSED: { text: "CLOSED" },
      },
      render: (_, row) => <StatusTag status={row.status} />,
    },
    {
      title: "AR",
      dataIndex: "billingStatus",
      width: 100,
      search: false,
      render: (_, row) => <StatusTag status={row.billingStatus} />,
    },
    {
      title: tx("jobGrossProfit"),
      dataIndex: "totalSell",
      width: 110,
      align: "right",
      search: false,
      render: (_, row) => {
        const gp = jobGrossProfit(row);
        if (!row.totalSell && !row.costs.length) return "—";
        return (
          <>
            <Money amount={gp} currency={row.currency} locale={locale === "zh" ? "zh-CN" : locale === "th" ? "th-TH" : "en-US"} />{" "}
            {row.currency}
          </>
        );
      },
    },
  ];

  return (
    <ProTable<ShellJob>
      rowKey="id"
      columns={columns}
      dataSource={rows}
      loading={loading}
      scroll={{ x: 1400 }}
      search={{
        labelWidth: "auto",
        filterType: "light",
      }}
      options={{
        reload: onReload ? () => onReload() : false,
        density: true,
        setting: { draggable: true, checkable: true },
      }}
      pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
      dateFormatter="string"
      headerTitle={extraToolbar}
      onRow={(record) => ({
        style: { cursor: "pointer" },
        onClick: () => navigate(`/jobs/${record.id}`),
      })}
      locale={{
        emptyText: error ?? tx("emptyShellCrm"),
      }}
    />
  );
}
