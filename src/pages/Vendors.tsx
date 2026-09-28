import { Boat, Buildings, CheckCircle, Stamp, Truck, Warehouse, type Icon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { App, Button, Drawer, Form, Input, Select } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchVendorBills, fetchVendors, vendorDisplayName } from "../api/commercial.ts";
import { useShellSupport, type ShellVendorType } from "../shell/supportStore.tsx";
import { useStore } from "../store";
import { CardGrid, DataTable, EntityCard, FilterBar, PageHeader, SegmentBar, ViewSwitch, readView, writeView } from "../v2/components";
import { useAppMode } from "../v2/hooks/useAppMode.ts";
import { LiveVendorDrawer } from "../v2/pages/finance/createDrawers.tsx";
import { MobileList, fmtTotals, sumByCurrency, useModeNote } from "../v2/pages/finance/financeKit.tsx";
import { BigMoney, VendorBadge } from "../v2/pages/finance/financeVisuals.tsx";

const TYPE_ICON: Record<string, Icon> = {
  shipping_line: Boat,
  trucking: Truck,
  customs: Stamp,
  depot: Warehouse,
  warehouse: Warehouse,
  other: Buildings,
};

const TYPES: ShellVendorType[] = ["shipping_line", "trucking", "customs", "depot", "warehouse", "other"];

type Row = {
  id: string;
  name: string;
  type: string;
  creditTerm: string;
  services: string;
  currencies: string;
  taxId: string;
};

type LiveVendor = {
  id: string;
  company: string;
  nameZh?: string | null;
  nameTh?: string | null;
  vendorType: string;
  paymentTermsDays?: number | null;
  services?: string | null;
  currencies?: string | null;
  taxId?: string | null;
};

export function VendorsPage() {
  const { shell, live } = useAppMode();
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const support = useShellSupport();
  const modeNote = useModeNote();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [type, setType] = useState<string | undefined>();
  const [layout, setLayoutState] = useState(() => readView("vendors"));
  const setLayout = (v: "cards" | "list") => {
    setLayoutState(v);
    writeView("vendors", v);
  };

  const liveVendors = useQuery({ queryKey: ["fin", "vendors"], queryFn: fetchVendors, enabled: live });
  const liveBills = useQuery({ queryKey: ["fin", "vendor-bills"], queryFn: () => fetchVendorBills(), enabled: live });

  const typeLabel = (t: string) => {
    const k = `fin_vtype_${t.toLowerCase()}`;
    const v = tx(k);
    return v === k ? t : v;
  };

  const rows: Row[] = useMemo(() => {
    if (shell)
      return support.vendors.map((v) => ({
        id: v.id,
        name: v.name,
        type: v.vendorType,
        creditTerm: v.creditTerm ?? "",
        services: "",
        currencies: "",
        taxId: "",
      }));
    return ((liveVendors.data ?? []) as LiveVendor[]).map((v) => ({
      id: v.id,
      name: vendorDisplayName(v, locale),
      type: v.vendorType.toLowerCase(),
      creditTerm: v.paymentTermsDays ? tx("fin_days", { n: v.paymentTermsDays }) : "",
      services: v.services ?? "",
      currencies: (v.currencies ?? "").split(",").filter(Boolean).join(", "),
      taxId: v.taxId ?? "",
    }));
  }, [shell, support.vendors, liveVendors.data, tx, locale]);

  // Unpaid bills per vendor
  const unpaid = useMemo(() => {
    const list = shell
      ? support.vendorBills.map((b) => ({ vendorId: b.vendorId, amount: b.amount, currency: b.currency, status: b.status }))
      : (liveBills.data ?? []).map((b) => ({ vendorId: b.vendorId, amount: parseFloat(b.total) || 0, currency: b.currency, status: b.status }));
    const m = new Map<string, typeof list>();
    for (const b of list) {
      if (b.status === "PAID") continue;
      m.set(b.vendorId, [...(m.get(b.vendorId) ?? []), b]);
    }
    return m;
  }, [shell, support.vendorBills, liveBills.data]);

  // All bills per vendor (paid vs open count, currencies used)
  const billStats = useMemo(() => {
    const list = shell
      ? support.vendorBills.map((b) => ({ vendorId: b.vendorId, currency: b.currency, status: b.status }))
      : (liveBills.data ?? []).map((b) => ({ vendorId: b.vendorId, currency: b.currency, status: b.status }));
    const m = new Map<string, { paid: number; open: number; currencies: Set<string> }>();
    for (const b of list) {
      const e = m.get(b.vendorId) ?? { paid: 0, open: 0, currencies: new Set<string>() };
      if (b.status === "PAID") e.paid += 1;
      else e.open += 1;
      if (b.currency) e.currencies.add(b.currency);
      m.set(b.vendorId, e);
    }
    return m;
  }, [shell, support.vendorBills, liveBills.data]);

  const needle = q.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (type && r.type !== type) return false;
    if (needle && !`${r.name} ${r.services} ${r.taxId}`.toLowerCase().includes(needle)) return false;
    return true;
  });

  const presentTypes = [...new Set(rows.map((r) => r.type))];

  const columns: ColumnsType<Row> = [
    {
      title: tx("fin_vendor"),
      key: "name",
      render: (_, r) => (
        <>
          <span className="cz-cell-main">{r.name}</span>
          {r.services ? <span className="cz-cell-sub">{r.services}</span> : null}
        </>
      ),
    },
    {
      title: tx("fin_vendorType"),
      key: "type",
      render: (_, r) => {
        const Icon = TYPE_ICON[r.type] ?? Buildings;
        return (
          <span className="fin-vtype">
            <Icon size={16} aria-hidden />
            {typeLabel(r.type)}
          </span>
        );
      },
    },
    { title: tx("fin_creditTerm"), key: "term", render: (_, r) => r.creditTerm || <span className="cz-muted">—</span> },
    ...(shell
      ? []
      : ([
          { title: tx("fin_currencies"), key: "cur", render: (_, r) => r.currencies || <span className="cz-muted">—</span> },
        ] as ColumnsType<Row>)),
    {
      title: tx("fin_unpaidBills"),
      key: "unpaid",
      align: "right",
      render: (_, r) => {
        const list = unpaid.get(r.id) ?? [];
        if (!list.length) return <span className="cz-muted">—</span>;
        return (
          <span className="cz-num">
            <span className="fin-amount">{fmtTotals(sumByCurrency(list, (b) => b.amount, (b) => b.currency), locale)}</span>
            <span className="cz-cell-sub">{tx("fin_nBills", { n: list.length })}</span>
          </span>
        );
      },
    },
  ];

  const primary = (
    <Button type="primary" onClick={() => setOpen(true)}>
      {tx("fin_newVendor")}
    </Button>
  );

  if (!shell && !live) return <PageHeader title={tx("fin_vendorsTitle")} subtitle={tx("apiNotConfigured")} />;

  return (
    <div className="cz-stack fin-page">
      <PageHeader
        title={tx("fin_vendorsTitle")}
        subtitle={[tx("fin_vendorsSub", { n: rows.length }), modeNote].filter(Boolean).join(" · ")}
        extra={
          <>
            <Link to="/vendor-bills">
              <Button>{tx("fin_billsTitle")}</Button>
            </Link>
            {primary}
          </>
        }
      />

      <FilterBar
        search={{ value: q, onChange: setQ, placeholder: tx("fin_searchVendors") }}
        selects={[
          {
            key: "type",
            placeholder: tx("fin_allTypes"),
            value: type,
            onChange: setType,
            options: presentTypes.map((t) => ({ value: t, label: typeLabel(t) })),
          },
        ]}
        onClear={() => {
          setQ("");
          setType(undefined);
        }}
        count={filtered.length}
        extra={<ViewSwitch value={layout} onChange={setLayout} labels={{ cards: tx("viewCards"), list: tx("viewList") }} />}
      />

      {layout === "cards" ? (
        filtered.length ? (
          <CardGrid min={280}>
            {filtered.map((r) => {
              const list = unpaid.get(r.id) ?? [];
              const st = billStats.get(r.id);
              const curs = [...new Set([...r.currencies.split(",").map((c) => c.trim()).filter(Boolean), ...(st?.currencies ?? [])])];
              return (
                <EntityCard
                  key={r.id}
                  to={`/vendor-bills?vendor=${encodeURIComponent(r.id)}`}
                  media={<VendorBadge type={r.type} size={44} />}
                  title={r.name}
                  subtitle={[typeLabel(r.type), r.creditTerm].filter(Boolean).join(" · ")}
                  footer={
                    curs.length ? (
                      <span className="fin-cur-row">
                        {curs.map((c) => (
                          <span key={c} className="fin-cur-chip">
                            {c}
                          </span>
                        ))}
                      </span>
                    ) : undefined
                  }
                >
                  {list.length ? (
                    <div className="fin-vendor-unpaid">
                      <div className="fin-vendor-unpaid-top">
                        <BigMoney text={fmtTotals(sumByCurrency(list, (b) => b.amount, (b) => b.currency), locale)} />
                        <span className="fin-muted-sm">{tx("fin_nBills", { n: list.length })}</span>
                      </div>
                      <SegmentBar
                        height={8}
                        parts={[
                          { value: st?.paid ?? 0, tone: "success", label: tx("fin_tabPaid") },
                          { value: st?.open ?? list.length, tone: "warning", label: tx("fin_unpaidBills") },
                        ]}
                      />
                    </div>
                  ) : (
                    <span className="fin-ok">
                      <CheckCircle size={18} weight="fill" aria-hidden />
                      {tx("fin_noUnpaid")}
                    </span>
                  )}
                </EntityCard>
              );
            })}
          </CardGrid>
        ) : (
          <div className="fin-empty-line">
            <span>{rows.length ? tx("noResults") : tx("fin_emptyVendors")}</span>
            {rows.length ? null : primary}
          </div>
        )
      ) : (
      <>
      <MobileList
        empty={rows.length ? tx("noResults") : tx("fin_emptyVendors")}
        items={filtered.map((r) => {
          const list = unpaid.get(r.id) ?? [];
          return {
            key: r.id,
            title: r.name,
            status: <span className="fin-vtype">{typeLabel(r.type)}</span>,
            sub: r.creditTerm || r.services,
            value: list.length ? fmtTotals(sumByCurrency(list, (b) => b.amount, (b) => b.currency), locale) : undefined,
            onClick: () => navigate(`/vendor-bills?vendor=${encodeURIComponent(r.id)}`),
          };
        })}
      />

      <DataTable<Row>
        className="fin-desktop-table"
        rowKey="id"
        loading={live && liveVendors.isLoading}
        columns={columns}
        dataSource={filtered}
        onRowClick={(r) => navigate(`/vendor-bills?vendor=${encodeURIComponent(r.id)}`)}
        emptyText={rows.length ? tx("noResults") : tx("fin_emptyVendors")}
        emptyAction={rows.length ? undefined : primary}
      />
      </>
      )}

      {live ? <LiveVendorDrawer open={open} onClose={() => setOpen(false)} typeLabel={typeLabel} /> : null}

      {shell ? (
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          title={tx("fin_newVendor")}
          width={440}
          destroyOnClose
          footer={
            <div className="fin-drawer-foot">
              <Button type="text" onClick={() => setOpen(false)}>
                {tx("fin_cancel")}
              </Button>
              <Button type="primary" form="fin-vendor-form" htmlType="submit">
                {tx("fin_save")}
              </Button>
            </div>
          }
        >
          <Form
            id="fin-vendor-form"
            layout="vertical"
            initialValues={{ vendorType: "shipping_line", creditTerm: "Net 30" }}
            onFinish={(v: { name: string; vendorType: ShellVendorType; creditTerm: string }) => {
              support.addVendor(v);
              message.success(tx("fin_vendorAdded", { name: v.name }));
              setOpen(false);
            }}
          >
            <Form.Item name="name" label={tx("fin_vendorName")} rules={[{ required: true, message: tx("fin_vendorNameRequired") }]}>
              <Input placeholder={tx("fin_vendorNamePh")} />
            </Form.Item>
            <Form.Item name="vendorType" label={tx("fin_vendorType")} rules={[{ required: true }]}>
              <Select options={TYPES.map((t) => ({ value: t, label: typeLabel(t) }))} />
            </Form.Item>
            <Form.Item name="creditTerm" label={tx("fin_creditTerm")}>
              <Input placeholder="Net 30" />
            </Form.Item>
          </Form>
        </Drawer>
      ) : null}
    </div>
  );
}
