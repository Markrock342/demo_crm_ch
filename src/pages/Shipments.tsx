import { Anchor, Boat, ClipboardText, Plus, ShippingContainer, Warning } from "@phosphor-icons/react";
import { App, Button, DatePicker, Descriptions, Drawer, Form, Input, InputNumber, Select, Space } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Locale } from "../i18n";
import { type ShipmentStatus } from "../logistics";
import { canEditLogistics } from "../shell/nav.ts";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useShellOps } from "../shell/opsStore.tsx";
import { useIsShellMode, useShellSession } from "../shell/session.tsx";
import { useStore } from "../store";
import {
  Board,
  DataTable,
  EmptyState,
  EntityCard,
  FilterBar,
  LaneCell,
  PageHeader,
  progressBetween,
  readView,
  RouteTrack,
  StageFlow,
  type StageKey,
  StatStrip,
  StatusTag,
  TransitBar,
  ViewSwitch,
  writeView,
} from "../v2/components";
import { useCustomerName, useJobNumbers } from "../v2/pages/ops/opsHooks.ts";
import { OpsMobileList, useIsNarrow } from "../v2/pages/ops/OpsMobileList.tsx";
import { boxMeta, boxStatusLabel, daysFromToday, fmtOpsDate, parseOpsDate, SHIPMENT_TONE } from "../v2/pages/ops/opsShared.ts";
import "../v2/pages/ops/ops.css";
import "../v2/pages/ops/opsVisual.css";

/** Board columns: booking + gate-in wait together; the rest follow the voyage. */
const BOARD: { key: Exclude<TabKey, "all">; icon: typeof Boat; tone: "primary" | "info" | "warning" | "success" }[] = [
  { key: "waiting", icon: ClipboardText, tone: "primary" },
  { key: "sail", icon: Boat, tone: "info" },
  { key: "arrived", icon: Anchor, tone: "success" },
];
/** The "arrived" column also keeps delivered bookings (shown done). */
const inColumn = (col: TabKey, st: ShipmentStatus) => (col === "arrived" ? st === "arrived" || st === "delivered" : inTab(col, st));

/** Shipment status → index in the shared six-stage flow. */
const STAGE_INDEX: Record<ShipmentStatus, number> = { booking: 0, gate_in: 1, sail: 2, arrived: 3, delivered: 5 };
const STAGE_KEYS: StageKey[] = ["booked", "gatein", "sailed", "arrived", "customs", "delivered"];

const STATUSES: ShipmentStatus[] = ["booking", "gate_in", "sail", "arrived", "delivered"];
/** Filter tabs: booking + gate-in share one "waiting to sail" tab to keep the switch short. */
type TabKey = "all" | "waiting" | "sail" | "arrived" | "delivered";
const TABS: TabKey[] = ["all", "waiting", "sail", "arrived", "delivered"];
const inTab = (tab: TabKey, st: ShipmentStatus) =>
  tab === "all" || (tab === "waiting" ? st === "booking" || st === "gate_in" : st === tab);

type Row = {
  id: string;
  customerId: string;
  jobId?: string;
  bookingNo: string;
  bl: string;
  vessel: string;
  voyage: string;
  carrier: string;
  pol: string;
  pod: string;
  etd: string;
  eta: string;
  teu: number;
  status: ShipmentStatus;
};

type FormValues = {
  customerId: string;
  bookingNo: string;
  bl?: string;
  vessel?: string;
  voyage?: string;
  carrier?: string;
  pol?: string;
  pod?: string;
  etd?: Dayjs;
  eta?: Dayjs;
  teu: number;
};

const clean = (v?: string) => (v && v !== "—" ? v : "");

/** A departure or arrival date that has slipped past today without the status moving on. */
function lateOf(s: Row): { field: "etd" | "eta"; days: number } | null {
  const etd = daysFromToday(s.etd);
  const eta = daysFromToday(s.eta);
  if ((s.status === "booking" || s.status === "gate_in") && etd !== null && etd < 0) return { field: "etd", days: -etd };
  if (s.status === "sail" && eta !== null && eta < 0) return { field: "eta", days: -eta };
  return null;
}


export function ShipmentsPage() {
  const shell = useIsShellMode();
  const { shellUser } = useShellSession();
  const store = useStore();
  const crm = useShellCrm();
  const ops = useShellOps();
  const { tx, locale, query } = store;
  const { message } = App.useApp();
  const customerNameOf = useCustomerName();
  const { jobNumberOf } = useJobNumbers();
  const [params, setParams] = useSearchParams();
  const jobIdFilter = params.get("jobId") ?? "";
  const canEdit = shell ? canEditLogistics(shellUser?.department ?? null) : true;
  const customers = shell ? crm.customers : store.customers;
  const shipments = (shell ? ops.shipments : store.shipments) as Row[];
  const boxes = shell ? ops.boxes : store.boxes;
  const status = (TABS.includes(params.get("status") as TabKey) ? params.get("status") : "all") as TabKey;
  const narrow = useIsNarrow();
  const [search, setSearch] = useState("");
  const [view, setViewState] = useState(() => readView("shipments"));
  const [lateOnly, setLateOnly] = useState(false);
  const setView = (v: "cards" | "list") => {
    setViewState(v);
    writeView("shipments", v);
  };
  const board = view === "cards";
  const [carrier, setCarrier] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form] = Form.useForm<FormValues>();
  const q = `${query} ${search}`.trim().toLowerCase();

  function setStatus(next: string) {
    const p = new URLSearchParams(params);
    if (next === "all") p.delete("status");
    else p.set("status", next);
    setParams(p, { replace: true });
  }

  const scoped = useMemo(
    () => shipments.filter((s) => !(jobIdFilter && "jobId" in s && s.jobId !== jobIdFilter)),
    [jobIdFilter, shipments],
  );

  const rows = useMemo(
    () =>
      scoped.filter((s) => {
        if (!board && !inTab(status, s.status)) return false;
        if (lateOnly && !lateOf(s)) return false;
        if (carrier && s.carrier !== carrier) return false;
        const blob = `${s.bookingNo} ${s.bl} ${s.vessel} ${s.voyage} ${s.carrier} ${s.pol} ${s.pod} ${customerNameOf(s.customerId)}`.toLowerCase();
        return !q || q.split(/\s+/).every((w) => blob.includes(w));
      }),
    [board, carrier, customerNameOf, lateOnly, q, scoped, status],
  );

  const boxesOf = useMemo(() => {
    type AnyBox = { id: string; type: string; status: string; bl: string; shipmentId?: string };
    const list = boxes as AnyBox[];
    const map: Record<string, AnyBox[]> = {};
    for (const s of scoped) {
      map[s.id] = list.filter((b) => ("shipmentId" in b && b.shipmentId ? b.shipmentId === s.id : false) || (b.bl && b.bl === s.bl));
    }
    return map;
  }, [boxes, scoped]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of TABS) c[t] = scoped.filter((s) => inTab(t, s.status)).length;
    return c;
  }, [scoped]);

  const departingSoon = scoped.filter((s) => {
    const d = daysFromToday(s.etd);
    return (s.status === "booking" || s.status === "gate_in") && d !== null && d >= 0 && d <= 7;
  }).length;

  const carrierOptions = useMemo(
    () => [...new Set(scoped.map((s) => clean(s.carrier)).filter(Boolean))].sort().map((c) => ({ value: c, label: c })),
    [scoped],
  );

  function submit(v: FormValues) {
    if (!shell || !canEdit) return;
    const fail = ops.addShipment({
      customerId: v.customerId,
      bookingNo: v.bookingNo,
      bl: v.bl ?? "",
      vessel: v.vessel ?? "",
      voyage: v.voyage ?? "",
      carrier: v.carrier ?? "",
      pol: v.pol ?? "",
      pod: v.pod ?? "",
      etd: v.etd ? v.etd.format("YYYY-MM-DD") : "",
      eta: v.eta ? v.eta.format("YYYY-MM-DD") : "",
      teu: v.teu,
      jobId: jobIdFilter || undefined,
    });
    if (fail) {
      message.error(tx("ops_ship_saveFailed"));
      return;
    }
    message.success(tx("ops_ship_created"));
    form.resetFields();
    setOpen(false);
  }

  const columns: ColumnsType<Row> = [
    {
      title: "Booking",
      key: "booking",
      fixed: "left",
      render: (_, s) => (
        <>
          <span className="cz-mono cz-cell-main">{s.bookingNo}</span>
          <span className="cz-cell-sub">{customerNameOf(s.customerId)}</span>
        </>
      ),
    },
    {
      title: tx("ops_col_status"),
      key: "status",
      render: (_, s) => <StatusTag status={s.status} label={tx(`ops_ship_${s.status}`)} tone={SHIPMENT_TONE[s.status]} />,
    },
    {
      title: tx("ops_col_vesselVoyage"),
      key: "vessel",
      render: (_, s) => (
        <>
          <span className="ops-soft">{clean(s.vessel) || "—"}</span>
          <span className="cz-cell-sub">{[clean(s.voyage), clean(s.carrier)].filter(Boolean).join(" · ") || "—"}</span>
        </>
      ),
    },
    { title: tx("ops_col_lane"), key: "lane", render: (_, s) => <LaneCell from={s.pol} to={s.pod} /> },
    {
      title: "ETD → ETA",
      key: "transit",
      render: (_, s) => {
        const late = lateOf(s);
        return (
          <span className="ops-transit">
            <TransitBar
              etd={parseOpsDate(s.etd)}
              eta={parseOpsDate(s.eta)}
              etdLabel={fmtOpsDate(s.etd, locale)}
              etaLabel={fmtOpsDate(s.eta, locale)}
              delayed={Boolean(late)}
            />
            {late ? (
              <span className="cz-cell-sub ops-alert is-danger">
                {late.field === "etd" ? "ETD" : "ETA"} · {tx("ops_ship_lateBy", { n: late.days })}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      title: tx("ops_col_containers"),
      key: "boxes",
      align: "right",
      render: (_, s) => (
        <span className="cz-num">
          <span className="ops-count">{boxesOf[s.id]?.length ?? 0}</span>
          <span className="cz-cell-sub">{s.teu} TEU</span>
        </span>
      ),
    },
  ];

  const detail = detailId ? scoped.find((s) => s.id === detailId) : undefined;
  const detailBoxes = detail ? boxesOf[detail.id] ?? [] : [];
  const detailJobNo = detail?.jobId ? jobNumberOf(detail.jobId) : undefined;
  const jobNo = jobIdFilter ? jobNumberOf(jobIdFilter) : undefined;
  const lateCount = scoped.filter((s) => lateOf(s)).length;
  const stageLabels = Object.fromEntries(STAGE_KEYS.map((k) => [k, tx(`stage_${k}`)])) as Record<StageKey, string>;

  return (
    <div className="ops-page">
      <PageHeader
        title={tx("ops_ship_title")}
        subtitle={jobIdFilter ? tx("ops_ship_subJob", { job: jobNo ?? "—", n: scoped.length }) : tx("ops_ship_sub", { n: scoped.length, m: departingSoon })}
        back={jobIdFilter ? { to: `/jobs/${jobIdFilter}`, label: jobNo ?? tx("ops_col_job") } : undefined}
        extra={
          <>
            <ViewSwitch value={view} onChange={setView} labels={{ cards: tx("ops_ship_viewBoard"), list: tx("viewList") }} />
            {shell && canEdit ? (
              <Button type="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)} disabled={customers.length === 0}>
                {tx("ops_ship_create")}
              </Button>
            ) : null}
          </>
        }
      >
        {board ? null : (
          <StatStrip
            stats={[
              { label: tx("ops_ship_statWaiting"), value: counts.waiting, hint: tx("ops_ship_statWaitingHint", { n: departingSoon }), to: "/shipments?status=waiting" },
              { label: tx("ops_ship_sail"), value: counts.sail, to: "/shipments?status=sail" },
              { label: tx("ops_ship_arrived"), value: counts.arrived, to: "/shipments?status=arrived", tone: counts.arrived ? "warning" : "default" },
              { label: tx("ops_ship_statLate"), value: lateCount, tone: lateCount ? "danger" : "success" },
            ]}
          />
        )}
        <FilterBar
          tabs={
            board
              ? undefined
              : {
                  value: status,
                  onChange: setStatus,
                  options: TABS.map((t) => ({ value: t, label: tx(t === "all" ? "ops_tab_all" : t === "waiting" ? "ops_ship_statWaiting" : `ops_ship_${t}`), count: counts[t] })),
                }
          }
          search={{ value: search, onChange: setSearch, placeholder: tx("ops_ship_search") }}
          selects={[{ key: "carrier", placeholder: tx("ops_col_carrier"), value: carrier, onChange: setCarrier, options: carrierOptions, width: 140 }]}
          extra={
            lateCount ? (
              <button type="button" className={`ops-late-toggle${lateOnly ? " is-on" : ""}`} aria-pressed={lateOnly} onClick={() => setLateOnly((v) => !v)}>
                <Warning size={16} weight="fill" aria-hidden />
                {tx("ops_ship_statLate")}
                <span className="ops-late-count">{lateCount}</span>
              </button>
            ) : null
          }
          onClear={() => {
            setSearch("");
            setCarrier(undefined);
            setLateOnly(false);
            setStatus("all");
          }}
          count={rows.length}
        />
      </PageHeader>

      {shell && customers.length === 0 ? (
        <p className="ops-callout is-warning">
          {tx("ops_needCustomer")} <Link to="/customers?new=1">{tx("ops_addCustomer")}</Link>
        </p>
      ) : null}

      {board && scoped.length ? (
        <Board
          columns={BOARD.map((col) => {
            const items = rows.filter((s) => inColumn(col.key, s.status));
            return {
              key: col.key,
              icon: col.icon,
              tone: col.tone,
              title: tx(col.key === "waiting" ? "ops_ship_statWaiting" : `ops_ship_${col.key}`),
              count: items.length,
              children: items.length ? (
                <div className="ops-board-stack">
                  {items.map((s) => (
                    <ShipmentCard key={s.id} s={s} boxes={boxesOf[s.id]?.length ?? 0} customer={customerNameOf(s.customerId)} onOpen={() => setDetailId(s.id)} />
                  ))}
                </div>
              ) : (
                <p className="ops-board-empty">—</p>
              ),
            };
          })}
        />
      ) : null}
      {board && !scoped.length ? (
        <EmptyState
          description={tx("ops_ship_empty")}
          action={
            shell && canEdit ? (
              <Button type="primary" onClick={() => setOpen(true)}>
                {tx("ops_ship_create")}
              </Button>
            ) : undefined
          }
        />
      ) : board ? null : narrow ? (
        <OpsMobileList
          items={rows.map((s) => {
            const late = lateOf(s);
            return {
              key: s.id,
              title: <span className="cz-mono">{s.bookingNo}</span>,
              status: <StatusTag status={s.status} label={tx(`ops_ship_${s.status}`)} tone={SHIPMENT_TONE[s.status]} />,
              line2: (
                <>
                  <span>{customerNameOf(s.customerId)}</span>
                  <LaneCell from={s.pol} to={s.pod} />
                </>
              ),
              line3: late ? (
                <span className="ops-alert is-danger">
                  {late.field === "etd" ? "ETD" : "ETA"} · {tx("ops_ship_lateBy", { n: late.days })}
                </span>
              ) : (
                <span className="cz-muted">
                  ETD {fmtOpsDate(s.etd, locale)} · ETA {fmtOpsDate(s.eta, locale)}
                </span>
              ),
              tone: late ? "danger" : undefined,
              onClick: () => setDetailId(s.id),
            };
          })}
          emptyText={scoped.length ? tx("noResults") : tx("ops_ship_empty")}
        />
      ) : (
        <DataTable<Row>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          onRowClick={(s) => setDetailId(s.id)}
          emptyText={scoped.length ? tx("noResults") : tx("ops_ship_empty")}
          emptyAction={
            !scoped.length && shell && canEdit ? (
              <Button type="primary" onClick={() => setOpen(true)}>
                {tx("ops_ship_create")}
              </Button>
            ) : undefined
          }
        />
      )}
      <Drawer
        open={Boolean(detail)}
        onClose={() => setDetailId(null)}
        width={480}
        title={detail ? <span className="cz-mono">{detail.bookingNo}</span> : null}
        extra={detail ? <StatusTag status={detail.status} label={tx(`ops_ship_${detail.status}`)} tone={SHIPMENT_TONE[detail.status]} /> : null}
      >
        {detail ? (
          <div className="cz-stack">
            {lateOf(detail) ? (
              <div className="ops-callout is-danger">
                {lateOf(detail)!.field === "etd" ? "ETD" : "ETA"} · {tx("ops_ship_lateBy", { n: lateOf(detail)!.days })}
              </div>
            ) : null}
            <div className="ops-ship-hero">
              <RouteTrack {...routeProps(detail, locale)} size="lg" />
              <StageFlow current={STAGE_INDEX[detail.status]} labels={stageLabels} problem={Boolean(lateOf(detail))} size="sm" />
            </div>
            <Descriptions
              column={1}
              size="small"
              colon={false}
              className="ops-desc"
              items={[
                { key: "c", label: tx("ops_col_customer"), children: customerNameOf(detail.customerId) },
                ...(detail.jobId
                  ? [{ key: "j", label: tx("ops_col_job"), children: <Link to={`/jobs/${detail.jobId}`}>{detailJobNo ?? tx("ops_openJob")}</Link> }]
                  : []),
                { key: "bl", label: "B/L", children: <span className="cz-mono">{clean(detail.bl) || "—"}</span> },
                { key: "v", label: tx("ops_col_vesselVoyage"), children: [clean(detail.vessel), clean(detail.voyage)].filter(Boolean).join(" / ") || "—" },
                { key: "cr", label: tx("ops_col_carrier"), children: clean(detail.carrier) || "—" },
                { key: "teu", label: "TEU", children: detail.teu },
              ]}
            />
            {shell && canEdit ? (
              <div className="ops-field">
                <label htmlFor="ops-ship-status">{tx("ops_changeStatus")}</label>
                <Select
                  id="ops-ship-status"
                  value={detail.status}
                  onChange={(v) => {
                    ops.setShipmentStatus(detail.id, v as ShipmentStatus);
                    message.success(tx("ops_statusSaved"));
                  }}
                  options={STATUSES.map((st) => ({ value: st, label: tx(`ops_ship_${st}`) }))}
                />
              </div>
            ) : null}
            <div>
              <h3 className="ops-drawer-h">{tx("ops_ship_containersIn", { n: detailBoxes.length })}</h3>
              {detailBoxes.length ? (
                <ul className="ops-unplaced">
                  {detailBoxes.map((b) => (
                    <li key={b.id} className="ops-box-line">
                      <span className="cz-mono cz-cell-main">{b.id}</span>
                      <span className="cz-muted">{b.type}</span>
                      <StatusTag status={b.status} label={boxStatusLabel(tx, b.status)} tone={boxMeta(b.status).tone} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ops-detail-empty">{tx("ops_ship_noContainers")}</p>
              )}
            </div>
            <Space wrap>
              <Link to={detail.jobId ? `/boxes?jobId=${detail.jobId}` : `/boxes?q=${encodeURIComponent(detail.bl)}`}>
                <Button>{tx("ops_viewContainers")}</Button>
              </Link>
              {detail.jobId ? (
                <Link to={`/docs?jobId=${detail.jobId}`}>
                  <Button>{tx("ops_viewDocs")}</Button>
                </Link>
              ) : null}
            </Space>
          </div>
        ) : null}
      </Drawer>

      <Drawer
        open={open && shell && canEdit}
        onClose={() => setOpen(false)}
        width={480}
        title={tx("ops_ship_create")}
        footer={
          <div className="ops-drawer-foot">
            <Button type="text" onClick={() => setOpen(false)}>
              {tx("ops_cancel")}
            </Button>
            <Button type="primary" onClick={() => form.submit()}>
              {tx("ops_save")}
            </Button>
          </div>
        }
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{ carrier: "COSCO", pol: "CNSHA", pod: "THLCH", teu: 2, customerId: customers[0]?.id }}
          onFinish={submit}
        >
          <Form.Item name="customerId" label={tx("ops_col_customer")} rules={[{ required: true, message: tx("ops_required") }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={customers.map((c) => ({ value: c.id, label: customerNameOf(c.id) }))}
            />
          </Form.Item>
          <div className="ops-form-row">
            <Form.Item name="bookingNo" label={tx("ops_bookingNo")} rules={[{ required: true, message: tx("ops_required") }]}>
              <Input className="cz-mono" autoFocus />
            </Form.Item>
            <Form.Item name="bl" label="B/L">
              <Input className="cz-mono" placeholder={tx("ops_ship_blHint")} />
            </Form.Item>
          </div>
          <div className="ops-form-row">
            <Form.Item name="vessel" label={tx("ops_vessel")}>
              <Input />
            </Form.Item>
            <Form.Item name="voyage" label={tx("ops_voyage")}>
              <Input />
            </Form.Item>
          </div>
          <div className="ops-form-row">
            <Form.Item name="carrier" label={tx("ops_col_carrier")}>
              <Input />
            </Form.Item>
            <Form.Item name="teu" label="TEU">
              <InputNumber min={1} style={{ width: "100%" }} />
            </Form.Item>
          </div>
          <div className="ops-form-row">
            <Form.Item name="pol" label={tx("ops_pol")}>
              <Input className="cz-mono" />
            </Form.Item>
            <Form.Item name="pod" label={tx("ops_pod")}>
              <Input className="cz-mono" />
            </Form.Item>
          </div>
          <div className="ops-form-row">
            <Form.Item name="etd" label="ETD">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="eta" label="ETA">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </div>
        </Form>
      </Drawer>
    </div>
  );
}

/** Route picture for a booking: ship sits at origin until it sails, then moves by date. */
function routeProps(s: Row, locale: Locale) {
  const late = lateOf(s);
  const done = s.status === "arrived" || s.status === "delivered";
  const progress = s.status === "sail" ? (progressBetween(parseOpsDate(s.etd), parseOpsDate(s.eta)) ?? 50) : done ? 100 : 0;
  return {
    from: s.pol,
    to: s.pod,
    // keep the ship clear of the port codes at either end
    progress: Math.max(6, late && s.status === "sail" ? Math.min(progress, 92) : progress),
    fromDate: `ETD ${fmtOpsDate(s.etd, locale)}`,
    toDate: `ETA ${fmtOpsDate(s.eta, locale)}`,
    delayed: Boolean(late),
    done,
  };
}

/** Board card: vessel is the title, the route is the picture, boxes + TEU at the foot. */
function ShipmentCard({ s, boxes, customer, onOpen }: { s: Row; boxes: number; customer: string; onOpen: () => void }) {
  const { tx, locale } = useStore();
  const late = lateOf(s);
  const vessel = clean(s.vessel);
  const carrierName = clean(s.carrier).split(/\s+/)[0];
  return (
    <EntityCard
      onClick={onOpen}
      tone={late ? "danger" : "default"}
      media={carrierName ? <span className="ops-carrier">{carrierName}</span> : undefined}
      title={vessel || s.bookingNo}
      subtitle={
        <>
          <span className="cz-mono">{s.bookingNo}</span> · {customer}
        </>
      }
      footer={
        <>
          <span className="ops-card-chips">
            <span className="ops-box-chip" title={tx("ops_col_containers")}>
              <ShippingContainer size={18} weight="duotone" aria-hidden />
              <strong>× {boxes}</strong>
            </span>
            <span className="ops-teu-chip">{s.teu} TEU</span>
          </span>
          {late ? (
            <span className="ops-late-chip" title={`${late.field === "etd" ? "ETD" : "ETA"} · ${tx("ops_ship_lateBy", { n: late.days })}`}>
              <Warning size={14} weight="fill" aria-hidden />
              {tx("ops_ship_lateShort", { n: late.days })}
            </span>
          ) : null}
        </>
      }
    >
      <RouteTrack {...routeProps(s, locale)} />
    </EntityCard>
  );
}
