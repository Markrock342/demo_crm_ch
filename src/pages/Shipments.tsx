import { Anchor, Boat, ClipboardText, LinkBreak, PencilSimple, Plus, ShippingContainer, Warning } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, DatePicker, Descriptions, Drawer, Form, Input, InputNumber, Popconfirm, Select, Space, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BOOKING_STAGES,
  createBooking,
  fetchBookings,
  linkBookingJob,
  patchBooking,
  unlinkBookingJob,
  type BookingDto,
  type BookingPatch,
  type BookingStage,
  type Cutoffs,
} from "../api/bookings.ts";
import { ApiError } from "../api/crm.ts";
import { createJobFromBooking, fetchJobs } from "../api/commercial.ts";
import type { Locale } from "../i18n";
import { useStore } from "../store";
import {
  Board,
  DataTable,
  EmptyState,
  EntityCard,
  ErrorState,
  FilterBar,
  LaneCell,
  LoadingState,
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
import { useAppMode } from "../v2/hooks/useAppMode.ts";
import { useCan } from "../v2/hooks/useCan.ts";
import { queryKeys } from "../v2/queries/keys.ts";
import { CutoffChips, CutoffEditor, cutoffKey, worstCutoff } from "../v2/pages/ops/Cutoffs.tsx";
import { useCustomerName } from "../v2/pages/ops/opsHooks.ts";
import { OpsMobileList, useIsNarrow } from "../v2/pages/ops/OpsMobileList.tsx";
import { boxMeta, boxStatusLabel, daysFromToday, fmtOpsDate, parseOpsDate, SHIPMENT_TONE } from "../v2/pages/ops/opsShared.ts";
import "../v2/pages/ops/ops.css";
import "../v2/pages/ops/opsVisual.css";
import "../v2/pages/ops/fields.css";

/*
 * Bookings (carrier space) served from /api/bookings. The board groups them by voyage stage;
 * a booking links to one or more jobs and carries SI / VGM / CY cut-offs.
 */

const BOOKINGS_KEY = ["bookings"] as const;

/** Board columns: booking + gate-in wait together; the rest follow the voyage. */
const BOARD: { key: Exclude<TabKey, "all">; icon: typeof Boat; tone: "primary" | "info" | "warning" | "success" }[] = [
  { key: "waiting", icon: ClipboardText, tone: "primary" },
  { key: "sail", icon: Boat, tone: "info" },
  { key: "arrived", icon: Anchor, tone: "success" },
];
/** The "arrived" column also keeps delivered bookings (shown done). */
const inColumn = (col: TabKey, st: BookingStage) => (col === "arrived" ? st === "arrived" || st === "delivered" : inTab(col, st));

/** Booking stage → index in the shared six-stage flow. */
const STAGE_INDEX: Record<BookingStage, number> = { booking: 0, gate_in: 1, sail: 2, arrived: 3, delivered: 5 };
const STAGE_KEYS: StageKey[] = ["booked", "gatein", "sailed", "arrived", "customs", "delivered"];

/** Filter tabs: booking + gate-in share one "waiting to sail" tab to keep the switch short. */
type TabKey = "all" | "waiting" | "sail" | "arrived" | "delivered";
const TABS: TabKey[] = ["all", "waiting", "sail", "arrived", "delivered"];
const inTab = (tab: TabKey, st: BookingStage) => tab === "all" || (tab === "waiting" ? st === "booking" || st === "gate_in" : st === tab);

const isCancelled = (b: BookingDto) => b.status === "CANCELLED";
const bookingNo = (b: BookingDto) => b.carrierBookingNo || b.bookingNumber;
/** Cut-offs only matter until the box is on board. */
const cutoffsMatter = (b: BookingDto) => b.stage === "booking" || b.stage === "gate_in";

type FormValues = {
  customerId: string;
  carrierBookingNo?: string;
  bl?: string;
  vessel?: string;
  voyage?: string;
  carrier?: string;
  pol: string;
  pod: string;
  etd?: Dayjs | null;
  eta?: Dayjs | null;
  teu?: number;
  siCutoff?: Dayjs | null;
  vgmCutoff?: Dayjs | null;
  cyCutoff?: Dayjs | null;
};

/** A departure or arrival date that has slipped past today without the stage moving on. */
function lateOf(b: BookingDto): { field: "etd" | "eta"; days: number } | null {
  if (isCancelled(b)) return null;
  const etd = daysFromToday(b.etd);
  const eta = daysFromToday(b.eta);
  if ((b.stage === "booking" || b.stage === "gate_in") && etd !== null && etd < 0) return { field: "etd", days: -etd };
  if (b.stage === "sail" && eta !== null && eta < 0) return { field: "eta", days: -eta };
  return null;
}

function errText(e: unknown, tx: (k: string) => string) {
  if (e instanceof ApiError && e.issues.some((i) => i.message === "eta_before_etd")) return tx("fd_bkEtaBeforeEtd");
  return tx("fd_saveFailed");
}

export function ShipmentsPage() {
  const { live } = useAppMode();
  const store = useStore();
  const { tx, locale, query } = store;
  const { message } = App.useApp();
  const can = useCan();
  const qc = useQueryClient();
  const customerNameOf = useCustomerName();
  const [params, setParams] = useSearchParams();
  const jobIdFilter = params.get("jobId") ?? "";
  const canEdit = can("shipment.edit");
  const customers = store.customers;
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
  const [formMode, setFormMode] = useState<null | "create" | "edit">(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [linkJobId, setLinkJobId] = useState<string | undefined>();
  const [form] = Form.useForm<FormValues>();
  const q = `${query} ${search}`.trim().toLowerCase();

  const bookingsQ = useQuery({ queryKey: BOOKINGS_KEY, queryFn: () => fetchBookings(), enabled: live });
  const jobsQ = useQuery({ queryKey: ["ops", "job-numbers"], queryFn: () => fetchJobs(), enabled: live, staleTime: 60_000 });
  const all = useMemo(() => bookingsQ.data ?? [], [bookingsQ.data]);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: BOOKINGS_KEY });
    await qc.invalidateQueries({ queryKey: queryKeys.jobs.all });
    await qc.invalidateQueries({ queryKey: ["ops", "job-numbers"] });
  };

  const save = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: BookingPatch }) => patchBooking(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: BOOKINGS_KEY });
      const prev = qc.getQueryData<BookingDto[]>(BOOKINGS_KEY);
      if (prev) qc.setQueryData<BookingDto[]>(BOOKINGS_KEY, prev.map((b) => (b.id === id ? ({ ...b, ...patch } as BookingDto) : b)));
      return { prev };
    },
    onSuccess: () => message.success(tx("fd_saved")),
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(BOOKINGS_KEY, ctx.prev);
      message.error(errText(e, tx));
    },
    onSettled: refresh,
  });

  const create = useMutation({
    mutationFn: createBooking,
    onSuccess: async (b) => {
      message.success(tx("fd_bkCreated"));
      await refresh();
      setFormMode(null);
      form.resetFields();
      setDetailId(b.id);
    },
    onError: (e) => message.error(errText(e, tx)),
  });

  const link = useMutation({
    mutationFn: ({ id, jobId, unlink }: { id: string; jobId: string; unlink?: boolean }) => (unlink ? unlinkBookingJob(id, jobId) : linkBookingJob(id, jobId)),
    onSuccess: async () => {
      message.success(tx("fd_saved"));
      setLinkJobId(undefined);
      await refresh();
    },
    onError: () => message.error(tx("fd_saveFailed")),
  });

  const makeJob = useMutation({
    mutationFn: (id: string) => createJobFromBooking(id),
    onSuccess: async () => {
      message.success(tx("fd_bkJobCreated"));
      await refresh();
    },
    onError: () => message.error(tx("fd_saveFailed")),
  });

  function setStatus(next: string) {
    const p = new URLSearchParams(params);
    if (next === "all") p.delete("status");
    else p.set("status", next);
    setParams(p, { replace: true });
  }

  const scoped = useMemo(() => all.filter((b) => !jobIdFilter || b.jobs.some((j) => j.id === jobIdFilter)), [all, jobIdFilter]);
  const active = useMemo(() => scoped.filter((b) => !isCancelled(b)), [scoped]);

  const rows = useMemo(
    () =>
      (board || status !== "all" ? active : scoped).filter((b) => {
        if (!board && !inTab(status, b.stage)) return false;
        if (lateOnly && !lateOf(b)) return false;
        if (carrier && b.carrier !== carrier) return false;
        const blob = `${b.bookingNumber} ${b.carrierBookingNo ?? ""} ${b.bl ?? ""} ${b.vessel ?? ""} ${b.voyage ?? ""} ${b.carrier ?? ""} ${b.pol} ${b.pod} ${customerNameOf(b.customerId)} ${b.jobs.map((j) => j.jobNumber).join(" ")}`.toLowerCase();
        return !q || q.split(/\s+/).every((w) => blob.includes(w));
      }),
    [active, board, carrier, customerNameOf, lateOnly, q, scoped, status],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of TABS) c[t] = active.filter((b) => inTab(t, b.stage)).length;
    return c;
  }, [active]);

  const departingSoon = active.filter((b) => {
    const d = daysFromToday(b.etd);
    return (b.stage === "booking" || b.stage === "gate_in") && d !== null && d >= 0 && d <= 7;
  }).length;

  const carrierOptions = useMemo(
    () => [...new Set(active.map((b) => b.carrier ?? "").filter(Boolean))].sort().map((c) => ({ value: c, label: c })),
    [active],
  );

  const detail = detailId ? all.find((b) => b.id === detailId) : undefined;
  const jobNo = jobIdFilter ? (jobsQ.data ?? []).find((j) => j.id === jobIdFilter)?.jobNumber : undefined;
  const lateCount = active.filter((b) => lateOf(b)).length;
  const stageLabels = Object.fromEntries(STAGE_KEYS.map((k) => [k, tx(`stage_${k}`)])) as Record<StageKey, string>;

  function openCreate() {
    const job = jobIdFilter ? (jobsQ.data ?? []).find((j) => j.id === jobIdFilter) : undefined;
    form.resetFields();
    form.setFieldsValue({
      customerId: job?.customerId ?? customers[0]?.id,
      pol: job?.pol ?? "CNSHA",
      pod: job?.pod ?? "THLCH",
      carrier: job?.carrier ?? undefined,
      vessel: job?.vessel ?? undefined,
      voyage: job?.voyage ?? undefined,
      etd: job?.etd ? dayjs(job.etd) : null,
      eta: job?.eta ? dayjs(job.eta) : null,
      teu: job?.teu || 2,
    });
    setFormMode("create");
  }

  function openEdit(b: BookingDto) {
    form.resetFields();
    form.setFieldsValue({
      customerId: b.customerId,
      carrierBookingNo: b.carrierBookingNo ?? undefined,
      bl: b.bl ?? undefined,
      vessel: b.vessel ?? undefined,
      voyage: b.voyage ?? undefined,
      carrier: b.carrier ?? undefined,
      pol: b.pol,
      pod: b.pod,
      etd: b.etd ? dayjs(b.etd) : null,
      eta: b.eta ? dayjs(b.eta) : null,
      teu: b.teu,
    });
    setFormMode("edit");
  }

  function submit(v: FormValues) {
    const day = (d?: Dayjs | null) => (d ? d.format("YYYY-MM-DD") : null);
    const body = {
      carrierBookingNo: v.carrierBookingNo?.trim() || null,
      bl: v.bl?.trim() || null,
      vessel: v.vessel?.trim() || null,
      voyage: v.voyage?.trim() || null,
      carrier: v.carrier?.trim() || null,
      pol: v.pol.trim(),
      pod: v.pod.trim(),
      etd: day(v.etd),
      eta: day(v.eta),
      teu: v.teu ?? 0,
    };
    if (formMode === "edit" && detail) {
      save.mutate({ id: detail.id, patch: body }, { onSuccess: () => setFormMode(null) });
      return;
    }
    create.mutate({
      ...body,
      customerId: v.customerId,
      siCutoff: v.siCutoff?.toISOString() ?? null,
      vgmCutoff: v.vgmCutoff?.toISOString() ?? null,
      cyCutoff: v.cyCutoff?.toISOString() ?? null,
      jobIds: jobIdFilter ? [jobIdFilter] : undefined,
    });
  }

  const stageTag = (b: BookingDto) =>
    isCancelled(b) ? <StatusTag status="cancelled" label={tx("fd_bkCancelled")} tone="neutral" /> : <StatusTag status={b.stage} label={tx(`ops_ship_${b.stage}`)} tone={SHIPMENT_TONE[b.stage]} />;

  const columns: ColumnsType<BookingDto> = [
    {
      title: "Booking",
      key: "booking",
      fixed: "left",
      render: (_, b) => (
        <>
          <span className="cz-mono cz-cell-main">{bookingNo(b)}</span>
          <span className="cz-cell-sub">{customerNameOf(b.customerId)}</span>
        </>
      ),
    },
    { title: tx("ops_col_status"), key: "status", render: (_, b) => stageTag(b) },
    {
      title: tx("ops_col_vesselVoyage"),
      key: "vessel",
      render: (_, b) => (
        <>
          <span className="ops-soft">{b.vessel || "—"}</span>
          <span className="cz-cell-sub">{[b.voyage, b.carrier].filter(Boolean).join(" · ") || "—"}</span>
        </>
      ),
    },
    { title: tx("ops_col_lane"), key: "lane", render: (_, b) => <LaneCell from={b.pol} to={b.pod} /> },
    {
      title: "ETD → ETA",
      key: "transit",
      render: (_, b) => {
        const late = lateOf(b);
        return (
          <span className="ops-transit">
            <TransitBar etd={parseOpsDate(b.etd)} eta={parseOpsDate(b.eta)} etdLabel={fmtOpsDate(b.etd, locale)} etaLabel={fmtOpsDate(b.eta, locale)} delayed={Boolean(late)} />
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
      title: tx("fd_cutoffs"),
      key: "cutoffs",
      render: (_, b) => (cutoffsMatter(b) && !isCancelled(b) ? <CutoffChips values={b} /> : <span className="cz-muted">—</span>),
    },
    {
      title: tx("ops_col_containers"),
      key: "boxes",
      align: "right",
      render: (_, b) => (
        <span className="cz-num">
          <span className="ops-count">{b.containers.length}</span>
          <span className="cz-cell-sub">{b.teu} TEU</span>
        </span>
      ),
    },
  ];

  const newButton =
    canEdit && live ? (
      <Button type="primary" icon={<Plus size={16} />} onClick={openCreate} disabled={customers.length === 0}>
        {tx("ops_ship_create")}
      </Button>
    ) : null;

  const linkable = detail
    ? (jobsQ.data ?? []).filter((j) => j.customerId === detail.customerId && !detail.jobs.some((x) => x.id === j.id))
    : [];

  return (
    <div className="ops-page">
      <PageHeader
        title={tx("ops_ship_title")}
        subtitle={jobIdFilter ? tx("ops_ship_subJob", { job: jobNo ?? "—", n: active.length }) : tx("ops_ship_sub", { n: active.length, m: departingSoon })}
        back={jobIdFilter ? { to: `/jobs/${jobIdFilter}`, label: jobNo ?? tx("ops_col_job") } : undefined}
        extra={
          <>
            <ViewSwitch value={view} onChange={setView} labels={{ cards: tx("ops_ship_viewBoard"), list: tx("viewList") }} />
            {newButton}
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

      {customers.length === 0 && canEdit ? (
        <p className="ops-callout is-warning">
          {tx("ops_needCustomer")} <Link to="/customers?new=1">{tx("ops_addCustomer")}</Link>
        </p>
      ) : null}

      {!live ? (
        <ErrorState title={tx("apiNotConfigured")} />
      ) : bookingsQ.isError ? (
        <ErrorState title={tx("fd_loadFailed")} action={<Button onClick={() => void bookingsQ.refetch()}>{tx("fd_retry")}</Button>} />
      ) : bookingsQ.isLoading ? (
        <LoadingState />
      ) : board && active.length ? (
        <Board
          columns={BOARD.map((col) => {
            const items = rows.filter((b) => inColumn(col.key, b.stage));
            return {
              key: col.key,
              icon: col.icon,
              tone: col.tone,
              title: tx(col.key === "waiting" ? "ops_ship_statWaiting" : `ops_ship_${col.key}`),
              count: items.length,
              children: items.length ? (
                <div className="ops-board-stack">
                  {items.map((b) => (
                    <BookingCard key={b.id} b={b} customer={customerNameOf(b.customerId)} onOpen={() => setDetailId(b.id)} />
                  ))}
                </div>
              ) : (
                <p className="ops-board-empty">—</p>
              ),
            };
          })}
        />
      ) : board ? (
        <EmptyState description={tx("ops_ship_empty")} action={newButton ?? undefined} />
      ) : narrow ? (
        <OpsMobileList
          items={rows.map((b) => {
            const late = lateOf(b);
            return {
              key: b.id,
              title: <span className="cz-mono">{bookingNo(b)}</span>,
              status: stageTag(b),
              line2: (
                <>
                  <span>{customerNameOf(b.customerId)}</span>
                  <LaneCell from={b.pol} to={b.pod} />
                </>
              ),
              line3: late ? (
                <span className="ops-alert is-danger">
                  {late.field === "etd" ? "ETD" : "ETA"} · {tx("ops_ship_lateBy", { n: late.days })}
                </span>
              ) : cutoffsMatter(b) && worstCutoff(b) ? (
                <CutoffChips values={b} />
              ) : (
                <span className="cz-muted">
                  ETD {fmtOpsDate(b.etd, locale)} · ETA {fmtOpsDate(b.eta, locale)}
                </span>
              ),
              tone: late ? "danger" : undefined,
              onClick: () => setDetailId(b.id),
            };
          })}
          emptyText={scoped.length ? tx("noResults") : tx("ops_ship_empty")}
        />
      ) : (
        <DataTable<BookingDto>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          onRowClick={(b) => setDetailId(b.id)}
          emptyText={scoped.length ? tx("noResults") : tx("ops_ship_empty")}
          emptyAction={!scoped.length ? (newButton ?? undefined) : undefined}
        />
      )}

      <Drawer
        open={Boolean(detail) && formMode !== "edit"}
        onClose={() => {
          setDetailId(null);
          setLinkJobId(undefined);
        }}
        width={500}
        title={detail ? <span className="cz-mono">{bookingNo(detail)}</span> : null}
        extra={
          detail ? (
            <Space size={4}>
              {stageTag(detail)}
              {canEdit ? (
                <Tooltip title={tx("fd_bkEdit")}>
                  <Button type="text" aria-label={tx("fd_bkEdit")} icon={<PencilSimple size={18} />} onClick={() => openEdit(detail)} />
                </Tooltip>
              ) : null}
            </Space>
          ) : null
        }
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
              <StageFlow current={STAGE_INDEX[detail.stage]} labels={stageLabels} problem={Boolean(lateOf(detail))} size="sm" />
            </div>
            {canEdit && !isCancelled(detail) ? (
              <div className="ops-field">
                <label htmlFor="ops-ship-status">{tx("ops_changeStatus")}</label>
                <Select
                  id="ops-ship-status"
                  value={detail.stage}
                  onChange={(v) => save.mutate({ id: detail.id, patch: { stage: v as BookingStage } })}
                  options={BOOKING_STAGES.map((st) => ({ value: st, label: tx(`ops_ship_${st}`) }))}
                />
              </div>
            ) : null}

            <section className="fd-panel" aria-label={tx("fd_cutoffs")}>
              <h3 className="ops-drawer-h">{tx("fd_cutoffs")}</h3>
              <CutoffEditor
                key={`${detail.id}|${cutoffKey(detail)}`}
                values={detail}
                disabled={!canEdit || isCancelled(detail)}
                saving={save.isPending}
                onSave={(v: Cutoffs) => save.mutate({ id: detail.id, patch: v })}
              />
            </section>

            <Descriptions
              column={1}
              size="small"
              colon={false}
              className="ops-desc"
              items={[
                { key: "c", label: tx("ops_col_customer"), children: customerNameOf(detail.customerId) },
                { key: "no", label: tx("fd_bkOurNo"), children: <span className="cz-mono">{detail.bookingNumber}</span> },
                ...(detail.carrierBookingNo ? [{ key: "cn", label: tx("fd_bkCarrierNo"), children: <span className="cz-mono">{detail.carrierBookingNo}</span> }] : []),
                { key: "bl", label: "B/L", children: <span className="cz-mono">{detail.bl || "—"}</span> },
                { key: "v", label: tx("ops_col_vesselVoyage"), children: [detail.vessel, detail.voyage].filter(Boolean).join(" / ") || "—" },
                { key: "cr", label: tx("ops_col_carrier"), children: detail.carrier || "—" },
                { key: "teu", label: "TEU", children: detail.teu },
              ]}
            />

            <section className="fd-panel">
              <h3 className="ops-drawer-h">{tx("fd_bkJobs")}</h3>
              {detail.jobs.length ? (
                <ul className="fd-jobs">
                  {detail.jobs.map((j) => (
                    <li key={j.id}>
                      <ClipboardText size={18} weight="duotone" aria-hidden />
                      <Link className="cz-mono fd-grow" to={`/jobs/${j.id}`}>
                        {j.jobNumber}
                      </Link>
                      {canEdit ? (
                        <Popconfirm title={tx("fd_bkUnlink")} okText={tx("fd_bkUnlink")} cancelText={tx("fd_cancel")} onConfirm={() => link.mutate({ id: detail.id, jobId: j.id, unlink: true })}>
                          <Tooltip title={tx("fd_bkUnlink")}>
                            <Button type="text" size="small" aria-label={tx("fd_bkUnlink")} icon={<LinkBreak size={16} />} />
                          </Tooltip>
                        </Popconfirm>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ops-detail-empty">{tx("fd_bkNoJobs")}</p>
              )}
              {canEdit && !isCancelled(detail) ? (
                <div className="fd-link-row">
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder={tx("fd_bkPickJob")}
                    value={linkJobId}
                    onChange={setLinkJobId}
                    options={linkable.map((j) => ({ value: j.id, label: j.jobNumber }))}
                    aria-label={tx("fd_bkLinkJob")}
                  />
                  <Button disabled={!linkJobId} loading={link.isPending} onClick={() => linkJobId && link.mutate({ id: detail.id, jobId: linkJobId })}>
                    {tx("fd_bkLinkJob")}
                  </Button>
                  {detail.jobs.length === 0 ? (
                    <Button type="primary" loading={makeJob.isPending} onClick={() => makeJob.mutate(detail.id)}>
                      {tx("fd_bkCreateJob")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>

            <div>
              <h3 className="ops-drawer-h">{tx("ops_ship_containersIn", { n: detail.containers.length })}</h3>
              {detail.containers.length ? (
                <ul className="ops-unplaced">
                  {detail.containers.map((c) => (
                    <li key={c.id} className="ops-box-line">
                      <span className="cz-mono cz-cell-main">{c.containerNo}</span>
                      <span className="cz-muted">{c.type}</span>
                      <StatusTag status={c.status} label={boxStatusLabel(tx, c.status)} tone={boxMeta(c.status).tone} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ops-detail-empty">{tx("ops_ship_noContainers")}</p>
              )}
            </div>
            <Space wrap>
              <Link to={detail.jobs[0] ? `/boxes?jobId=${detail.jobs[0].id}` : `/boxes?q=${encodeURIComponent(detail.bl ?? bookingNo(detail))}`}>
                <Button>{tx("ops_viewContainers")}</Button>
              </Link>
              {detail.jobs[0] ? (
                <Link to={`/docs?jobId=${detail.jobs[0].id}`}>
                  <Button>{tx("ops_viewDocs")}</Button>
                </Link>
              ) : null}
              {canEdit ? (
                isCancelled(detail) ? (
                  <Button onClick={() => save.mutate({ id: detail.id, patch: { status: "CONFIRMED" } })}>{tx("fd_bkRestore")}</Button>
                ) : (
                  <Popconfirm title={tx("fd_bkCancelConfirm")} okText={tx("fd_bkCancel")} cancelText={tx("fd_cancel")} okButtonProps={{ danger: true }} onConfirm={() => save.mutate({ id: detail.id, patch: { status: "CANCELLED" } })}>
                    <Button danger type="text">
                      {tx("fd_bkCancel")}
                    </Button>
                  </Popconfirm>
                )
              ) : null}
            </Space>
          </div>
        ) : null}
      </Drawer>

      <Drawer
        open={formMode !== null && canEdit}
        onClose={() => setFormMode(null)}
        width={480}
        title={formMode === "edit" ? tx("fd_bkEdit") : tx("ops_ship_create")}
        footer={
          <div className="ops-drawer-foot">
            <Button type="text" onClick={() => setFormMode(null)}>
              {tx("ops_cancel")}
            </Button>
            <Button type="primary" loading={create.isPending || save.isPending} onClick={() => form.submit()}>
              {tx("ops_save")}
            </Button>
          </div>
        }
      >
        <Form<FormValues> form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="customerId" label={tx("ops_col_customer")} rules={[{ required: true, message: tx("ops_required") }]}>
            <Select
              showSearch
              disabled={formMode === "edit" || Boolean(jobIdFilter)}
              optionFilterProp="label"
              options={customers.map((c) => ({ value: c.id, label: customerNameOf(c.id) }))}
            />
          </Form.Item>
          <div className="ops-form-row">
            <Form.Item name="carrierBookingNo" label={tx("fd_bkCarrierNo")}>
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
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </div>
          <div className="ops-form-row">
            <Form.Item name="pol" label={tx("ops_pol")} rules={[{ required: true, message: tx("ops_required") }]}>
              <Input className="cz-mono" />
            </Form.Item>
            <Form.Item name="pod" label={tx("ops_pod")} rules={[{ required: true, message: tx("ops_required") }]}>
              <Input className="cz-mono" />
            </Form.Item>
          </div>
          <div className="ops-form-row">
            <Form.Item name="etd" label="ETD">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              name="eta"
              label="ETA"
              dependencies={["etd"]}
              rules={[
                ({ getFieldValue }) => ({
                  validator: (_, v?: Dayjs | null) => {
                    const etd = getFieldValue("etd") as Dayjs | null | undefined;
                    return !v || !etd || !v.isBefore(etd, "day") ? Promise.resolve() : Promise.reject(new Error(tx("fd_bkEtaBeforeEtd")));
                  },
                }),
              ]}
            >
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </div>
          {formMode === "create" ? (
            <>
              <h3 className="ops-drawer-h">{tx("fd_cutoffs")}</h3>
              <div className="ops-form-row">
                <Form.Item name="siCutoff" label={tx("fd_cut_si")}>
                  <DatePicker showTime={{ format: "HH:mm", minuteStep: 15 }} format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item name="vgmCutoff" label={tx("fd_cut_vgm")}>
                  <DatePicker showTime={{ format: "HH:mm", minuteStep: 15 }} format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} />
                </Form.Item>
              </div>
              <Form.Item name="cyCutoff" label={tx("fd_cut_cy")}>
                <DatePicker showTime={{ format: "HH:mm", minuteStep: 15 }} format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} />
              </Form.Item>
            </>
          ) : null}
        </Form>
      </Drawer>
    </div>
  );
}

/** Route picture for a booking: ship sits at origin until it sails, then moves by date. */
function routeProps(b: BookingDto, locale: Locale) {
  const late = lateOf(b);
  const done = b.stage === "arrived" || b.stage === "delivered";
  const progress = b.stage === "sail" ? (progressBetween(parseOpsDate(b.etd), parseOpsDate(b.eta)) ?? 50) : done ? 100 : 0;
  return {
    from: b.pol,
    to: b.pod,
    // keep the ship clear of the port codes at either end
    progress: Math.max(6, late && b.stage === "sail" ? Math.min(progress, 92) : progress),
    fromDate: `ETD ${fmtOpsDate(b.etd, locale)}`,
    toDate: `ETA ${fmtOpsDate(b.eta, locale)}`,
    delayed: Boolean(late),
    done,
  };
}

/** Board card: vessel is the title, the route is the picture, cut-offs under it, boxes + TEU at the foot. */
function BookingCard({ b, customer, onOpen }: { b: BookingDto; customer: string; onOpen: () => void }) {
  const { tx, locale } = useStore();
  const late = lateOf(b);
  const carrierName = (b.carrier ?? "").split(/\s+/)[0];
  const cut = cutoffsMatter(b) ? worstCutoff(b) : null;
  return (
    <EntityCard
      onClick={onOpen}
      tone={late ? "danger" : cut === "danger" || cut === "warning" ? "warning" : "default"}
      media={carrierName ? <span className="ops-carrier">{carrierName}</span> : undefined}
      title={b.vessel || bookingNo(b)}
      subtitle={
        <>
          <span className="cz-mono">{bookingNo(b)}</span> · {customer}
        </>
      }
      footer={
        <>
          <span className="ops-card-chips">
            <span className="ops-box-chip" title={tx("ops_col_containers")}>
              <ShippingContainer size={18} weight="duotone" aria-hidden />
              <strong>× {b.containers.length}</strong>
            </span>
            <span className="ops-teu-chip">{b.teu} TEU</span>
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
      <RouteTrack {...routeProps(b, locale)} />
      {cut ? <CutoffChips values={b} /> : null}
    </EntityCard>
  );
}
