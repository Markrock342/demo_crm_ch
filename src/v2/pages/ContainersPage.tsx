import type { ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { customerName, type Customer } from "../../data";
import { fetchContainers, type ContainerDto } from "../../api/operations.ts";
import { useShellCrm } from "../../shell/crmStore.tsx";
import { useShellOps } from "../../shell/opsStore.tsx";
import { useStore } from "../../store";
import { PageHeader } from "../components/PageHeader.tsx";
import { StatusTag } from "../components/StatusTag.tsx";
import { useAppMode } from "../hooks/useAppMode.ts";
import { queryKeys } from "../queries/keys.ts";

export function ContainersPageV2() {
  const { tx, locale } = useStore();
  const { shell, live } = useAppMode();
  const crm = useShellCrm();
  const ops = useShellOps();

  const liveQ = useQuery({
    queryKey: queryKeys.containers.all,
    queryFn: () => fetchContainers(),
    enabled: live,
  });

  const shellRows: ContainerDto[] = ops.boxes.map((b) => {
    const ship = ops.shipments.find((s) => s.id === b.shipmentId);
    return {
      id: b.id,
      jobId: ship?.jobId ?? null,
      customerId: b.customerId,
      containerNo: b.id,
      type: b.type,
      status: b.status,
      direction: b.dir,
      bl: b.bl,
      pol: null,
      pod: null,
      teu: b.teu,
      eta: b.eta,
      yardCode: b.yardZh,
      vessel: null,
      seal: null,
      commodity: null,
    };
  });

  const rows = shell ? shellRows : (liveQ.data ?? []);

  const columns: ProColumns<ContainerDto>[] = [
    { title: tx("colBox"), dataIndex: "containerNo", width: 130 },
    {
      title: tx("colCustomer"),
      dataIndex: "customerId",
      render: (_, r) => {
        const c = crm.customers.find((x) => x.id === r.customerId);
        return c ? customerName(c as Customer, locale) : r.customerId;
      },
    },
    { title: tx("colType"), dataIndex: "type", width: 80 },
    { title: tx("colStatus"), dataIndex: "status", render: (_, r) => <StatusTag status={String(r.status)} /> },
    { title: tx("colYard"), dataIndex: "yardCode" },
    { title: tx("colEta"), dataIndex: "eta" },
    {
      title: "Job",
      dataIndex: "jobId",
      render: (id) => (id ? <Link to={`/jobs/${id}`}>{id}</Link> : "—"),
    },
  ];

  return (
    <div style={{ padding: "0 8px 24px" }}>
      <PageHeader
        title={tx("boxesTitle")}
        subtitle={`${rows.length} · ${shell ? tx("shellDataBadge") : live ? tx("liveApiBadge") : tx("apiNotConfigured")}`}
      />
      {!shell && !live ? <p>{tx("apiNotConfigured")}</p> : null}
      {(shell || live) && (
        <ProTable<ContainerDto>
          rowKey="id"
          loading={live && liveQ.isLoading}
          columns={columns}
          dataSource={rows}
          search={false}
          pagination={{ pageSize: 20 }}
        />
      )}
    </div>
  );
}
