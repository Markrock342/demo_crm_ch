import { CheckCircle, HandCoins, PencilSimpleLine, SealCheck, Wallet, WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Drawer, Form, InputNumber, Popconfirm, Select } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { approveVendorBill as apiApprove, fetchVendorBills, fetchVendors, payVendorBill, vendorDisplayName } from "../api/commercial.ts";
import { useShellSupport } from "../shell/supportStore.tsx";
import { useStore } from "../store";
import { Board, DataTable, EntityCard, FilterBar, PageHeader, StatusTag, Tile, TileRow, ViewSwitch, readView, writeView } from "../v2/components";
import { useAppMode } from "../v2/hooks/useAppMode.ts";
import { fmtDate, fmtMoney } from "../v2/lib/format.ts";
import { LiveVendorBillDrawer } from "../v2/pages/finance/createDrawers.tsx";
import { DueCell, JobLink, MobileList, daysUntil, fmtTotals, noCents, sumByCurrency, useJobLookup, useModeNote } from "../v2/pages/finance/financeKit.tsx";
import { BigMoney, DueChip, VendorBadge } from "../v2/pages/finance/financeVisuals.tsx";

type Row = {
  id: string;
  billNumber: string;
  vendorId: string;
  vendorName: string;
  jobId: string | null;
  amount: number;
  currency: string;
  status: string;
  billDate: string | null;
  dueDate: string | null;
};

type View = "all" | "draft" | "approved" | "paid";

const toPay = (r: Row) => r.status === "APPROVED" || r.status === "PARTIAL";

export function VendorBillsPage() {
  const { shell, live } = useAppMode();
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const support = useShellSupport();
  const { numberOf, options: jobOptions } = useJobLookup();
  const modeNote = useModeNote();
  const [view, setView] = useState<View>("all");
  const [q, setQ] = useState("");
  const [params] = useSearchParams();
  const [vendorFilter, setVendorFilter] = useState<string | undefined>(params.get("vendor") ?? undefined);
  const [open, setOpen] = useState(false);
  const [layout, setLayoutState] = useState(() => readView("vendor-bills"));
  const setLayout = (v: "cards" | "list") => {
    setLayoutState(v);
    writeView("vendor-bills", v);
  };

  const liveBills = useQuery({ queryKey: ["fin", "vendor-bills"], queryFn: () => fetchVendorBills(), enabled: live });
  const liveVendors = useQuery({ queryKey: ["fin", "vendors"], queryFn: fetchVendors, enabled: live });

  const vendorName = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of support.vendors) m.set(v.id, v.name);
    for (const v of liveVendors.data ?? []) m.set(v.id, vendorDisplayName(v, locale));
    return m;
  }, [support.vendors, liveVendors.data, locale]);

  const vendorType = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of support.vendors) m.set(v.id, v.vendorType);
    for (const v of liveVendors.data ?? []) m.set(v.id, v.vendorType);
    return m;
  }, [support.vendors, liveVendors.data]);

  const typeLabel = (t: string | undefined) => {
    if (!t) return "";
    const k = `fin_vtype_${t.toLowerCase()}`;
    const v = tx(k);
    return v === k ? t : v;
  };

  const rows: Row[] = useMemo(() => {
    if (shell)
      return support.vendorBills.map((b) => ({
        id: b.id,
        billNumber: b.billNumber,
        vendorId: b.vendorId,
        vendorName: b.vendorName,
        jobId: b.jobId ?? null,
        amount: b.amount,
        currency: b.currency,
        status: b.status,
        billDate: b.createdAt,
        dueDate: null,
      }));
    return (liveBills.data ?? []).map((b) => ({
      id: b.id,
      billNumber: b.billNumber,
      vendorId: b.vendorId,
      vendorName: vendorName.get(b.vendorId) ?? "—",
      jobId: b.jobId,
      amount: parseFloat(b.total) || 0,
      currency: b.currency,
      status: b.status,
      billDate: b.billDate || null,
      dueDate: b.dueDate || null,
    }));
  }, [shell, support.vendorBills, liveBills.data, vendorName]);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["fin", "vendor-bills"] });
  const approveMut = useMutation({ mutationFn: apiApprove, onSuccess: invalidate });
  const payMut = useMutation({ mutationFn: (id: string) => payVendorBill(id), onSuccess: invalidate });

  async function approve(r: Row) {
    try {
      if (shell) support.approveVendorBill(r.id);
      else await approveMut.mutateAsync(r.id);
      message.success(tx("fin_billApproved", { no: r.billNumber }));
    } catch (e) {
      message.error(tx("fin_actionFailed", { err: e instanceof Error ? e.message : "" }));
    }
  }

  async function pay(r: Row) {
    try {
      if (shell) support.payVendorBill(r.id);
      else await payMut.mutateAsync(r.id);
      message.success(tx("fin_billPaid", { no: r.billNumber }));
    } catch (e) {
      message.error(tx("fin_actionFailed", { err: e instanceof Error ? e.message : "" }));
    }
  }

  const counts = {
    all: rows.length,
    draft: rows.filter((r) => r.status === "DRAFT").length,
    approved: rows.filter(toPay).length,
    paid: rows.filter((r) => r.status === "PAID").length,
  };

  const needle = q.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (view === "draft" && r.status !== "DRAFT") return false;
    if (view === "approved" && !toPay(r)) return false;
    if (view === "paid" && r.status !== "PAID") return false;
    if (vendorFilter && r.vendorId !== vendorFilter) return false;
    if (needle && !`${r.billNumber} ${r.vendorName} ${numberOf(r.jobId) ?? ""}`.toLowerCase().includes(needle)) return false;
    return true;
  });

  const unpaid = rows.filter((r) => r.status !== "PAID" && r.status !== "VOID" && r.status !== "CANCELLED");
  const overdue = unpaid.filter((r) => (daysUntil(r.dueDate) ?? 0) < 0);
  const sum = (list: Row[]) => fmtTotals(sumByCurrency(list, (r) => r.amount, (r) => r.currency), locale, fmtMoney(0, "USD", locale));
  const draftRows = rows.filter((r) => r.status === "DRAFT");
  const toPayRows = rows.filter(toPay);
  const columns: ColumnsType<Row> = [
    {
      title: tx("fin_colBill"),
      key: "no",
      render: (_, r) => (
        <>
          <span className="cz-cell-main">{r.billNumber}</span>
          <span className="cz-cell-sub">{r.vendorName}</span>
        </>
      ),
    },
    { title: tx("fin_colJob"), key: "job", render: (_, r) => <JobLink id={r.jobId} numberOf={numberOf} /> },
    { title: tx("fin_colStatus"), key: "status", render: (_, r) => <StatusTag status={r.status} /> },
    {
      title: tx("fin_colDue"),
      key: "due",
      render: (_, r) =>
        r.dueDate ? (
          <DueCell date={r.dueDate} open={r.status !== "PAID"} />
        ) : (
          <span className="cz-muted">
            {fmtDate(r.billDate, locale)}
            <span className="cz-cell-sub">{tx("fin_billedOn")}</span>
          </span>
        ),
    },
    {
      title: tx("fin_colAmount"),
      key: "amount",
      align: "right",
      render: (_, r) => <span className="cz-num fin-amount">{fmtMoney(r.amount, r.currency, locale)}</span>,
    },
    {
      title: <span className="sr-only">{tx("fin_colActions")}</span>,
      key: "actions",
      align: "right",
      render: (_, r) =>
        r.status === "DRAFT" ? (
          <Popconfirm
            title={tx("fin_approveConfirm", { no: r.billNumber })}
            okText={tx("fin_approve")}
            cancelText={tx("fin_cancel")}
            onConfirm={() => approve(r)}
          >
            <Button size="small" type="link">
              {tx("fin_approve")}
            </Button>
          </Popconfirm>
        ) : toPay(r) ? (
          <Popconfirm
            title={tx("fin_payConfirm", { no: r.billNumber })}
            description={fmtMoney(r.amount, r.currency, locale)}
            okText={tx("fin_markPaid")}
            cancelText={tx("fin_cancel")}
            onConfirm={() => pay(r)}
          >
            <Button size="small" type="link">
              {tx("fin_markPaid")}
            </Button>
          </Popconfirm>
        ) : null,
    },
  ];

  const vendorOptions = shell
    ? support.vendors.map((v) => ({ value: v.id, label: v.name }))
    : (liveVendors.data ?? []).map((v) => ({ value: v.id, label: vendorDisplayName(v, locale) }));

  const primary = (
    <Button type="primary" onClick={() => setOpen(true)} disabled={shell && !support.vendors.length}>
      {tx("fin_newBill")}
    </Button>
  );

  function billCard(r: Row) {
    const t = vendorType.get(r.vendorId);
    const late = r.status !== "PAID" && (daysUntil(r.dueDate) ?? 0) < 0;
    const paid = r.status === "PAID";
    return (
      <EntityCard
        key={r.id}
        tone={late ? "danger" : "default"}
        media={<VendorBadge type={t} label={typeLabel(t)} />}
        title={r.vendorName}
        subtitle={r.billNumber}
        badge={r.dueDate || paid ? <DueChip date={r.dueDate} open={!paid} paid={paid} /> : undefined}
        footer={
          <>
            <span className="fin-card-job">{r.jobId ? <JobLink id={r.jobId} numberOf={numberOf} /> : null}</span>
            <span className="fin-card-actions">
              {r.status === "DRAFT" ? (
                <Popconfirm title={tx("fin_approveConfirm", { no: r.billNumber })} okText={tx("fin_approve")} cancelText={tx("fin_cancel")} onConfirm={() => approve(r)}>
                  <Button type="primary" icon={<SealCheck size={16} weight="bold" />} loading={approveMut.isPending && approveMut.variables === r.id}>
                    {tx("fin_approve")}
                  </Button>
                </Popconfirm>
              ) : toPay(r) ? (
                <Popconfirm
                  title={tx("fin_payConfirm", { no: r.billNumber })}
                  description={fmtMoney(r.amount, r.currency, locale)}
                  okText={tx("fin_markPaid")}
                  cancelText={tx("fin_cancel")}
                  onConfirm={() => pay(r)}
                >
                  <Button type="primary" icon={<HandCoins size={16} weight="bold" />} loading={payMut.isPending && payMut.variables === r.id}>
                    {tx("fin_markPaid")}
                  </Button>
                </Popconfirm>
              ) : null}
            </span>
          </>
        }
      >
        <BigMoney text={fmtMoney(r.amount, r.currency, locale)} tone={late ? "danger" : paid ? "muted" : "default"} />
      </EntityCard>
    );
  }

  if (!shell && !live) {
    return <PageHeader title={tx("fin_billsTitle")} subtitle={tx("apiNotConfigured")} />;
  }

  return (
    <div className="cz-stack fin-page">
      <PageHeader
        title={tx("fin_billsTitle")}
        subtitle={modeNote || undefined}
        extra={
          <>
            <Link to="/vendors">
              <Button>{tx("fin_billsVendorsLink")}</Button>
            </Link>
            {live ? (
              <Link to="/jobs">
                <Button>{tx("fin_billFromJob")}</Button>
              </Link>
            ) : null}
            {primary}
          </>
        }
      >
        <TileRow>
          <Tile icon={Wallet} tone="primary" value={noCents(sum(unpaid))} label={tx("fin_statPayable")} visual={<span className="fin-tile-n">{tx("fin_nBills", { n: unpaid.length })}</span>} />
          <Tile
            icon={SealCheck}
            tone={counts.draft ? "warning" : "neutral"}
            value={String(counts.draft)}
            label={tx("fin_statToApprove")}
            visual={counts.draft ? <span className="fin-tile-n">{sum(draftRows)}</span> : undefined}
          />
          <Tile icon={HandCoins} tone="primary" value={String(counts.approved)} label={tx("fin_statToPay")} visual={counts.approved ? <span className="fin-tile-n">{sum(toPayRows)}</span> : undefined} />
          <Tile
            icon={WarningCircle}
            tone={overdue.length ? "danger" : "neutral"}
            value={String(overdue.length)}
            label={tx("fin_statOverdue")}
            visual={overdue.length ? <span className="fin-tile-n">{sum(overdue)}</span> : undefined}
          />
        </TileRow>
      </PageHeader>

      <FilterBar
        tabs={{
          value: view,
          onChange: (v) => setView(v as View),
          options: [
            { value: "all", label: tx("fin_tabAll"), count: counts.all },
            { value: "draft", label: tx("fin_tabToApprove"), count: counts.draft },
            { value: "approved", label: tx("fin_tabToPay"), count: counts.approved },
            { value: "paid", label: tx("fin_tabPaid"), count: counts.paid },
          ],
        }}
        search={{ value: q, onChange: setQ, placeholder: tx("fin_searchBills") }}
        selects={[
          { key: "vendor", placeholder: tx("fin_allVendors"), value: vendorFilter, onChange: setVendorFilter, options: vendorOptions, width: 200 },
        ]}
        onClear={() => {
          setQ("");
          setVendorFilter(undefined);
          setView("all");
        }}
        count={filtered.length}
        extra={<ViewSwitch value={layout} onChange={setLayout} labels={{ cards: tx("viewCards"), list: tx("viewList") }} />}
      />

      {layout === "cards" ? (
        <Board
          columns={[
            { key: "draft", icon: PencilSimpleLine, tone: "warning" as const, title: tx("fin_tabToApprove"), list: filtered.filter((r) => r.status === "DRAFT") },
            { key: "topay", icon: HandCoins, tone: "primary" as const, title: tx("fin_tabToPay"), list: filtered.filter(toPay) },
            { key: "paid", icon: CheckCircle, tone: "success" as const, title: tx("fin_tabPaid"), list: filtered.filter((r) => r.status === "PAID") },
          ].map((c) => ({
            key: c.key,
            icon: c.icon,
            tone: c.tone,
            title: c.title,
            count: c.list.length,
            children: c.list.length ? c.list.map(billCard) : <div className="fin-board-empty">{tx("fin_noneHere")}</div>,
          }))}
        />
      ) : (
      <>
      <MobileList
        empty={rows.length ? tx("noResults") : tx("fin_emptyBills")}
        items={filtered.map((r) => ({
          key: r.id,
          title: r.billNumber,
          status: <StatusTag status={r.status} />,
          sub: r.vendorName,
          value: fmtMoney(r.amount, r.currency, locale),
          action:
            r.status === "DRAFT" ? (
              <Popconfirm title={tx("fin_approveConfirm", { no: r.billNumber })} okText={tx("fin_approve")} cancelText={tx("fin_cancel")} onConfirm={() => approve(r)}>
                <Button size="small">{tx("fin_approve")}</Button>
              </Popconfirm>
            ) : toPay(r) ? (
              <Popconfirm title={tx("fin_payConfirm", { no: r.billNumber })} okText={tx("fin_markPaid")} cancelText={tx("fin_cancel")} onConfirm={() => pay(r)}>
                <Button size="small">{tx("fin_markPaid")}</Button>
              </Popconfirm>
            ) : undefined,
        }))}
      />

      <DataTable<Row>
        className="fin-desktop-table"
        rowKey="id"
        loading={live && liveBills.isLoading}
        columns={columns}
        dataSource={filtered}
        emptyText={rows.length ? tx("noResults") : tx("fin_emptyBills")}
        emptyAction={rows.length ? undefined : primary}
      />
      </>
      )}

      {live ? <LiveVendorBillDrawer open={open} onClose={() => setOpen(false)} jobs={jobOptions} defaultVendorId={vendorFilter} /> : null}

      {shell ? (
        <NewBillDrawer
          open={open}
          onClose={() => setOpen(false)}
          vendors={vendorOptions}
          jobs={jobOptions}
          onSubmit={(v) => {
            support.addVendorBill(v);
            message.success(tx("fin_billCreated"));
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function NewBillDrawer({
  open,
  onClose,
  onSubmit,
  vendors,
  jobs,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (v: { vendorId: string; amount: number; currency: string; jobId?: string }) => void;
  vendors: { value: string; label: string }[];
  jobs: { value: string; label: string }[];
}) {
  const { tx } = useStore();
  const [form] = Form.useForm();
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={tx("fin_newBill")}
      width={440}
      destroyOnClose
      footer={
        <div className="fin-drawer-foot">
          <Button type="text" onClick={onClose}>
            {tx("fin_cancel")}
          </Button>
          <Button type="primary" onClick={() => form.submit()}>
            {tx("fin_save")}
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ amount: 500, currency: "USD" }}
        onFinish={(v) => onSubmit({ vendorId: v.vendorId, amount: Number(v.amount), currency: v.currency, jobId: v.jobId || undefined })}
      >
        <Form.Item name="vendorId" label={tx("fin_vendor")} rules={[{ required: true, message: tx("fin_pickVendor") }]}>
          <Select showSearch optionFilterProp="label" options={vendors} placeholder={tx("fin_pickVendor")} />
        </Form.Item>
        <Form.Item name="jobId" label={tx("fin_colJob")}>
          <Select allowClear showSearch optionFilterProp="label" options={jobs} placeholder={tx("fin_optional")} />
        </Form.Item>
        <div className="fin-form-row">
          <Form.Item name="amount" label={tx("fin_colAmount")} rules={[{ required: true, message: tx("fin_amountRequired") }]}>
            <InputNumber min={0} step={100} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="currency" label={tx("fin_currency")}>
            <Select options={["USD", "THB", "CNY"].map((c) => ({ value: c, label: c }))} />
          </Form.Item>
        </div>
      </Form>
    </Drawer>
  );
}
