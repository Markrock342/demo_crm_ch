import type { ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { Button } from "antd";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { cityName, customerName, laneName, type Customer } from "../../data";
import { useShellCrm } from "../../shell/crmStore.tsx";
import { useStore } from "../../store";
import { PageHeader } from "../components/PageHeader.tsx";
import { useAppMode } from "../hooks/useAppMode.ts";

export function CustomersPageV2() {
  const { tx, locale, query, customers: storeCustomers } = useStore();
  const crm = useShellCrm();
  const { shell, live } = useAppMode();
  const navigate = useNavigate();
  const customers = shell ? crm.customers : storeCustomers;

  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      customers.filter((c) => {
        const blob = `${c.nameZh} ${c.nameTh} ${c.nameEn} ${c.cityZh} ${c.laneZh} ${c.owner}`.toLowerCase();
        return !q || blob.includes(q);
      }),
    [customers, q],
  );

  const columns: ProColumns<Customer>[] = [
    {
      title: tx("colCustomer"),
      dataIndex: "nameZh",
      render: (_, c) => customerName(c, locale),
    },
    { title: tx("colLane"), dataIndex: "laneZh", render: (_, c) => laneName(c, locale) },
    { title: tx("colOwner"), dataIndex: "owner", width: 120 },
    {
      title: tx("colUpdated"),
      dataIndex: "cityZh",
      render: (_, c) => cityName(c, locale),
    },
  ];

  return (
    <div style={{ padding: "0 8px 24px" }}>
      <PageHeader
        title={tx("customersTitle")}
        subtitle={`${rows.length} · ${shell ? tx("shellDataBadge") : live ? tx("liveApiBadge") : tx("demoMode")}`}
        extra={<Button type="primary" disabled={!shell}>{tx("addCustomer")}</Button>}
      />
      <ProTable<Customer>
        rowKey="id"
        columns={columns}
        dataSource={rows as Customer[]}
        search={false}
        options={{ density: true, setting: true }}
        pagination={{ pageSize: 20 }}
        onRow={(c) => ({ style: { cursor: "pointer" }, onClick: () => navigate(`/customers/${c.id}`) })}
      />
    </div>
  );
}
