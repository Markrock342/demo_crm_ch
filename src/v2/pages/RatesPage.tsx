import type { ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { Button, Form, Input } from "antd";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { RateSearchRow } from "../../api/commercial.ts";
import { useShellSupport } from "../../shell/supportStore.tsx";
import { useIsShellMode } from "../../shell/session.tsx";
import { useStore } from "../../store";
import { PageHeader } from "../components/PageHeader.tsx";
import { Money } from "../components/Money.tsx";
import { useAppMode } from "../hooks/useAppMode.ts";
import { useLiveRates } from "../hooks/useCommercial.ts";

export function RatesPageV2() {
  const shell = useIsShellMode();
  const { live } = useAppMode();
  const { tx, locale } = useStore();
  const support = useShellSupport();
  const navigate = useNavigate();
  const [search, setSearch] = useState({ origin: "Shanghai", destination: "Laem Chabang", containerType: "40HC" });
  const liveRates = useLiveRates(search, live);

  const shellRows = useMemo(
    () =>
      support.rates.map((r) => ({
        laneId: r.id,
        vendor: r.carrier,
        carrier: r.carrier,
        origin: r.origin,
        destination: r.destination,
        pol: r.origin,
        pod: r.destination,
        mode: "FCL",
        containerType: r.containerType,
        validFrom: r.validFrom,
        validUntil: r.validUntil,
        currency: r.currency,
        totalBuy: String(r.buyAmount),
        totalSell: String(r.sellAmount),
        margin: String(r.sellAmount - r.buyAmount),
        marginPct: r.sellAmount ? String(((r.sellAmount - r.buyAmount) / r.sellAmount) * 100) : "0",
        status: "ACTIVE" as const,
      })),
    [support.rates],
  );

  const rows: RateSearchRow[] = shell ? shellRows : (liveRates.data ?? []);
  const localeTag = locale === "zh" ? "zh-CN" : locale === "th" ? "th-TH" : "en-US";

  const columns: ProColumns<RateSearchRow>[] = [
    { title: "POL", dataIndex: "pol", width: 120 },
    { title: "POD", dataIndex: "pod", width: 120 },
    { title: tx("colCarrier"), dataIndex: "carrier", width: 100 },
    { title: tx("colBoxType"), dataIndex: "containerType", width: 80 },
    {
      title: "Buy",
      dataIndex: "totalBuy",
      align: "right",
      render: (_, r) => (r.totalBuy ? <Money amount={parseFloat(r.totalBuy)} currency={r.currency} locale={localeTag} /> : "—"),
    },
    {
      title: "Sell",
      dataIndex: "totalSell",
      align: "right",
      render: (_, r) => (r.totalSell ? <Money amount={parseFloat(r.totalSell)} currency={r.currency} locale={localeTag} /> : "—"),
    },
    { title: "Valid", dataIndex: "validUntil", width: 100 },
    { title: tx("colStatus"), dataIndex: "status", width: 100 },
    {
      title: "",
      valueType: "option",
      width: 120,
      render: () => [
        <Button key="q" type="link" size="small" onClick={() => navigate("/quotations/new")}>
          {tx("rateCreateQuote")}
        </Button>,
      ],
    },
  ];

  return (
    <div style={{ padding: "0 8px 24px" }}>
      <PageHeader
        title={tx("navRates")}
        subtitle={shell ? tx("shellDataBadge") : live ? tx("liveApiBadge") : tx("apiNotConfigured")}
      />
      {live ? (
        <Form layout="inline" style={{ marginBottom: 16 }} onFinish={() => liveRates.refetch()}>
          <Form.Item label="Origin">
            <Input value={search.origin} onChange={(e) => setSearch((s) => ({ ...s, origin: e.target.value }))} />
          </Form.Item>
          <Form.Item label="Destination">
            <Input value={search.destination} onChange={(e) => setSearch((s) => ({ ...s, destination: e.target.value }))} />
          </Form.Item>
          <Form.Item label="Type">
            <Input value={search.containerType} onChange={(e) => setSearch((s) => ({ ...s, containerType: e.target.value }))} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={liveRates.isLoading}>
            Search
          </Button>
        </Form>
      ) : null}
      {!shell && !live ? <p>{tx("apiNotConfigured")}</p> : null}
      {(shell || live) && (
        <ProTable<RateSearchRow>
          rowKey="laneId"
          loading={live && liveRates.isLoading}
          columns={columns}
          dataSource={rows}
          search={false}
          pagination={{ pageSize: 20 }}
        />
      )}
    </div>
  );
}
