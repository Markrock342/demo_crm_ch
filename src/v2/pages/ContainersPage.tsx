import { ArrowClockwise, Boat, CheckCircle, ClipboardText, MapTrifold, Plus, Stamp, Timer, Warehouse, WarningCircle, type Icon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Descriptions, Drawer, Form, Input, InputNumber, Select, Space, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { snapshotStatusToShell, trackingMock } from "../../adapters/mock/tracking.mock.ts";
import { createContainerApi, fetchContainers, type ContainerDto } from "../../api/operations.ts";
import { SHELL_BOX_STATUSES, type ShellBoxStatus, type ShellDemurrageRisk } from "../../ports/ops.port.ts";
import { canEditLogistics } from "../../shell/nav.ts";
import { useShellOps, YARD_SLOTS } from "../../shell/opsStore.tsx";
import { useShellSession } from "../../shell/session.tsx";
import { useStore } from "../../store";
import {
  AiBriefCard,
  CardGrid,
  DataTable,
  EmptyState,
  FilterBar,
  IconBadge,
  PageHeader,
  readView,
  RouteTrack,
  StatusTag,
  Tile,
  TileRow,
  ViewSwitch,
  writeView,
} from "../components";
import type { Tone } from "../components/Graphics.tsx";
import { useAppMode } from "../hooks/useAppMode.ts";
import { useCustomerLookup } from "../hooks/useCustomerLookup.ts";
import { fmtLane } from "../lib/format.ts";
import { placeName } from "../lib/places.ts";
import { queryKeys } from "../queries/keys.ts";
import { useCustomerName, useJobNumbers } from "./ops/opsHooks.ts";
import { boxMeta, boxStatusLabel, daysFromToday, fmtOpsDate, parseOpsDate, type BoxGroup } from "./ops/opsShared.ts";
import { OpsMobileList, useIsNarrow } from "./ops/OpsMobileList.tsx";
import { BoxPortrait, BoxStrip, boxTone, FREE_DAYS, FreeTimeBar, freeTimeOf, PlaceChip, seaProgress } from "./ops/BoxVisuals.tsx";
import "./ops/ops.css";

type Row = ContainerDto & {
  location: string;
  lastFreeDay?: string;
  risk?: ShellDemurrageRisk;
  etaChanged?: boolean;
  carrier?: string;
};

type Tab = "all" | Exclude<BoxGroup, "pending"> | "attention";
const TABS: Tab[] = ["all", "yard", "sea", "customs", "attention"];

type Alert = { tone: "danger" | "warning"; text: string } | null;

type Section = { key: BoxGroup; icon: Icon; tone: Tone; title: string };

export function ContainersPageV2() {
  const { tx, locale } = useStore();
  const { shell, live } = useAppMode();
  const { shellUser } = useShellSession();
  const ops = useShellOps();
  const { message } = App.useApp();
  const narrow = useIsNarrow();
  const customerNameOf = useCustomerName();
  const { customers } = useCustomerLookup();
  const { jobNumberOf } = useJobNumbers();
  const [params, setParams] = useSearchParams();
  const canEdit = shell ? canEditLogistics(shellUser?.department ?? null) : live;

  const tab = (TABS.includes(params.get("tab") as Tab) ? params.get("tab") : "all") as Tab;
  const jobIdFilter = params.get("jobId") ?? "";
  const shipmentIdFilter = params.get("shipmentId") ?? "";
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [customerFilter, setCustomerFilter] = useState<string | undefined>();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [view, setViewState] = useState<"cards" | "list">(() => readView("boxes"));
  const setView = (v: "cards" | "list") => {
    setViewState(v);
    writeView("boxes", v);
  };

  const liveQ = useQuery({
    queryKey: queryKeys.containers.all,
    queryFn: () => fetchContainers(),
    enabled: live,
  });

  const rows: Row[] = useMemo(() => {
    if (shell) {
      return ops.boxes.map((b) => {
        const ship = ops.shipments.find((s) => s.id === b.shipmentId);
        const location = locale === "th" ? b.yardTh : locale === "en" ? b.yardEn : b.yardZh;
        return {
          id: b.id,
          jobId: ship?.jobId ?? null,
          customerId: b.customerId,
          containerNo: b.id,
          type: b.type,
          status: b.status,
          direction: b.dir,
          bl: b.bl && b.bl !== "—" ? b.bl : null,
          pol: b.pol ?? ship?.pol ?? null,
          pod: b.pod ?? ship?.pod ?? null,
          teu: b.teu,
          eta: b.eta,
          yardCode: b.yardZh,
          vessel: b.vessel ?? ship?.vessel ?? null,
          seal: b.seal ?? null,
          commodity: null,
          location: location || b.yardZh,
          lastFreeDay: b.lastFreeDay,
          risk: b.demurrageRisk,
          etaChanged: b.etaChanged,
          carrier: b.carrier ?? ship?.carrier,
          shipmentId: b.shipmentId,
        } as Row & { shipmentId?: string };
      });
    }
    return (liveQ.data ?? []).map((r) => ({ ...r, location: placeName(r.yardCode, locale) }));
  }, [liveQ.data, locale, ops.boxes, ops.shipments, shell]);

  /** Why a container needs someone's attention (overdue free time, hold, ETA slipped). */
  function alertOf(r: Row): Alert {
    const meta = boxMeta(r.status);
    if (meta.group === "done") return null;
    const lfd = freeTimeOf(r)?.daysLeft ?? null;
    if (lfd !== null && lfd < 0) return { tone: "danger", text: tx("ops_box_freeOver", { n: -lfd }) };
    if (r.risk === "risk") return { tone: "danger", text: tx("ops_box_riskDemurrage") };
    if (r.status === "hold") return { tone: "danger", text: tx("ops_box_onHold") };
    const eta = daysFromToday(r.eta);
    if (meta.group === "sea" && eta !== null && eta < 0) return { tone: "warning", text: tx("ops_box_etaPassed", { n: -eta }) };
    if (lfd !== null && lfd <= 2) return { tone: "warning", text: tx("ops_box_freeSoon", { n: lfd }) };
    if (r.risk === "watch") return { tone: "warning", text: tx("ops_box_watch") };
    if (r.etaChanged) return { tone: "warning", text: tx("ops_box_etaChanged") };
    return null;
  }

  const scoped = useMemo(
    () =>
      rows.filter((r) => {
        if (jobIdFilter && r.jobId !== jobIdFilter) return false;
        if (shipmentIdFilter && (r as Row & { shipmentId?: string }).shipmentId !== shipmentIdFilter) return false;
        return true;
      }),
    [jobIdFilter, rows, shipmentIdFilter],
  );

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: scoped.length, yard: 0, sea: 0, customs: 0, done: 0, attention: 0 };
    for (const r of scoped) {
      const g = boxMeta(r.status).group;
      if (g !== "pending") c[g] += 1;
      if (alertOf(r)) c.attention += 1;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, tx]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      scoped.filter((r) => {
        if (tab === "attention" ? !alertOf(r) : tab !== "all" && boxMeta(r.status).group !== tab) return false;
        if (customerFilter && r.customerId !== customerFilter) return false;
        if (typeFilter && r.type !== typeFilter) return false;
        if (!q) return true;
        const blob = `${r.containerNo} ${r.bl ?? ""} ${r.location} ${r.vessel ?? ""} ${customerNameOf(r.customerId)} ${jobNumberOf(r.jobId) ?? ""}`.toLowerCase();
        return blob.includes(q);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customerFilter, customerNameOf, jobNumberOf, q, scoped, tab, typeFilter, tx],
  );

  const teu = scoped.reduce((n, r) => n + (r.teu ?? 0), 0);
  const freeDays = scoped.map((r) => freeTimeOf(r)?.daysLeft).filter((d): d is number => d !== undefined);
  const freeSoon = freeDays.filter((d) => d <= 3).length;
  const freeOverdue = freeDays.some((d) => d < 0);
  const customerOptions = useMemo(() => {
    const ids = [...new Set(scoped.map((r) => r.customerId))];
    return ids.map((id) => ({ value: id, label: customerNameOf(id) })).sort((a, b) => a.label.localeCompare(b.label));
  }, [customerNameOf, scoped]);
  const typeOptions = useMemo(() => [...new Set(scoped.map((r) => r.type))].sort().map((t) => ({ value: t, label: t })), [scoped]);

  function setTab(next: string) {
    const p = new URLSearchParams(params);
    if (next === "all") p.delete("tab");
    else p.set("tab", next);
    setParams(p, { replace: true });
  }

  function clearFilters() {
    setSearch("");
    setCustomerFilter(undefined);
    setTypeFilter(undefined);
    setTab("all");
  }

  const boxFacts = {
    containers: rows.length,
    hold: rows.filter((r) => r.status === "hold").length,
    inTransit: rows.filter((r) => boxMeta(r.status).group === "sea").length,
    teu: rows.reduce((n, r) => n + (r.teu ?? 0), 0),
  };
  const boxLocal = `Container fleet: ${rows.length} units, ${boxFacts.teu} TEU, ${boxFacts.hold} on hold, ${boxFacts.inTransit} sailing.`;

  async function refreshTracking(r: Row) {
    if (!shell) return;
    setBusyId(r.id);
    try {
      const snap = await trackingMock.refresh({ containerNo: r.containerNo, bl: r.bl ?? "", currentEta: r.eta ?? "" });
      ops.applyTrackingSnapshot(r.id, {
        status: snapshotStatusToShell(snap.status),
        eta: snap.eta,
        vessel: snap.vessel,
        carrier: snap.carrier,
        lastFreeDay: snap.lastFreeDay,
      });
      message.success(tx("ops_box_trackingUpdated"));
    } finally {
      setBusyId(null);
    }
  }

  const columns: ColumnsType<Row> = [
    {
      title: tx("ops_col_container"),
      key: "no",
      fixed: "left",
      render: (_, r) => (
        <>
          <span className="cz-mono cz-cell-main">{r.containerNo}</span>
          <span className="cz-cell-sub">
            {r.type} · {r.direction === "out" ? tx("ops_dir_out") : tx("ops_dir_in")}
          </span>
        </>
      ),
    },
    {
      title: tx("ops_col_status"),
      key: "status",
      render: (_, r) => <StatusTag status={r.status} label={boxStatusLabel(tx, r.status)} tone={boxMeta(r.status).tone} />,
    },
    {
      title: tx("ops_col_location"),
      key: "loc",
      render: (_, r) => {
        const atSea = boxMeta(r.status).group === "sea";
        return (
          <>
            <span className="ops-soft">{atSea && r.vessel ? r.vessel : r.location || "—"}</span>
            <span className="cz-cell-sub">{r.pol || r.pod ? fmtLane(r.pol, r.pod) : atSea ? tx("ops_box_atSea") : ""}</span>
          </>
        );
      },
    },
    {
      title: tx("ops_col_customerJob"),
      key: "cust",
      render: (_, r) => {
        const jobNo = jobNumberOf(r.jobId);
        return (
          <>
            <span className="ops-soft">{customerNameOf(r.customerId)}</span>
            {jobNo ? (
              <Link className="cz-cell-sub ops-sub-link" to={`/jobs/${r.jobId}`}>
                {jobNo}
              </Link>
            ) : (
              <span className="cz-cell-sub">{tx("ops_noJob")}</span>
            )}
          </>
        );
      },
    },
    {
      title: tx("ops_col_etaFree"),
      key: "eta",
      render: (_, r) => {
        const alert = alertOf(r);
        const hasLfd = Boolean(r.lastFreeDay && r.lastFreeDay !== "—");
        return (
          <>
            <span className="ops-soft">
              {hasLfd
                ? `${tx("ops_freeUntil")} ${fmtOpsDate(r.lastFreeDay, locale)}`
                : parseOpsDate(r.eta)
                  ? `ETA ${fmtOpsDate(r.eta, locale)}`
                  : alert
                    ? null
                    : "—"}
            </span>
            {alert ? <span className={`cz-cell-sub ops-alert is-${alert.tone}`}>{alert.text}</span> : null}
          </>
        );
      },
    },
  ];

  const open = openId ? rows.find((r) => r.id === openId) : undefined;
  const openAlert = open ? alertOf(open) : null;
  const openJobNo = open ? jobNumberOf(open.jobId) : undefined;
  const openFree = open ? freeTimeOf(open) : null;
  const openRoute = open ? boxMeta(open.status).group === "sea" || Boolean(open.pol && open.pod && boxMeta(open.status).group === "pending") : false;

  function freeLabels(n: number) {
    return { left: tx("ops_bx_daysLeft", { n }), over: tx("ops_bx_daysOver", { n: -n }), last: tx("ops_bx_lastDay") };
  }

  /** Red first, then amber, then the rest — so problems sit at the top of each group. */
  function severity(r: Row) {
    const a = alertOf(r);
    return a?.tone === "danger" ? 2 : a ? 1 : 0;
  }

  const sections: Section[] = [
    { key: "sea", icon: Boat, tone: "primary", title: tx("ops_tab_sea") },
    { key: "customs", icon: Stamp, tone: "warning", title: tx("ops_bx_tileHold") },
    { key: "yard", icon: Warehouse, tone: "neutral", title: tx("ops_tab_yard") },
    { key: "pending", icon: ClipboardText, tone: "neutral", title: tx("ops_box_waiting_booking") },
    { key: "done", icon: CheckCircle, tone: "success", title: tx("ops_tab_done") },
  ];

  function renderBoxCard(r: Row) {
    const alert = alertOf(r);
    const jobNo = jobNumberOf(r.jobId);
    const customer = customerNameOf(r.customerId);
    const g = boxMeta(r.status).group;
    const tone = boxTone(r);
    const ft = freeTimeOf(r);
    const moving = g === "sea";
    const showAlertDot = alert && !(ft && ft.daysLeft <= 3) && r.status !== "hold";
    return (
      <button
        type="button"
        className={`bx-card${tone === "danger" ? " is-danger" : alert ? " is-warning" : ""}`}
        key={r.id}
        onClick={() => setOpenId(r.id)}
        aria-label={`${r.containerNo} · ${boxStatusLabel(tx, r.status)} · ${customer}`}
      >
        <BoxStrip no={r.containerNo} type={r.type} tone={tone}>
          {showAlertDot ? (
            <Tooltip title={alert.text}>
              <span className={`bx-alert-dot is-${alert.tone}`}>
                <WarningCircle size={16} weight="fill" aria-label={alert.text} />
              </span>
            </Tooltip>
          ) : null}
        </BoxStrip>
        <div className="bx-card-body">
          <div className="bx-card-visual">
            {moving ? (
              <RouteTrack
                size="sm"
                from={r.pol}
                to={r.pod}
                progress={seaProgress(r.eta)}
                toDate={parseOpsDate(r.eta) ? fmtOpsDate(r.eta, locale) : undefined}
                delayed={(daysFromToday(r.eta) ?? 0) < 0}
              />
            ) : (
              <PlaceChip name={r.location} />
            )}
          </div>
          {ft ? <FreeTimeBar daysLeft={ft.daysLeft} labels={freeLabels(ft.daysLeft)} hint={ft.estimated ? tx("ops_bx_freeEst", { n: FREE_DAYS }) : undefined} /> : null}
          <div className="bx-card-foot">
            <span className="bx-card-cust">{customer}</span>
            <span className="bx-card-job">{jobNo ?? ""}</span>
          </div>
        </div>
      </button>
    );
  }

  const subtitle = jobIdFilter
    ? tx("ops_box_subJob", { job: jobNumberOf(jobIdFilter) ?? "—", n: scoped.length })
    : tx("ops_box_sub", { n: scoped.length, teu });

  return (
    <div className="ops-page">
      <PageHeader
        title={tx("ops_box_title")}
        subtitle={subtitle}
        back={jobIdFilter ? { to: `/jobs/${jobIdFilter}`, label: jobNumberOf(jobIdFilter) ?? tx("ops_col_job") } : undefined}
        extra={
          <>
            {shell || live ? <AiBriefCard title={tx("ops_box_aiTitle")} facts={boxFacts} localFallback={boxLocal} /> : null}
            <Link to="/yard">
              <Button icon={<MapTrifold size={16} />}>{tx("ops_yard_open")}</Button>
            </Link>
            {canEdit ? (
              <Button type="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)} disabled={customers.length === 0}>
                {tx("ops_box_create")}
              </Button>
            ) : null}
          </>
        }
      >
        <TileRow>
          <Tile icon={Boat} tone="primary" value={counts.sea} label={tx("ops_tab_sea")} to="/boxes?tab=sea" />
          <Tile icon={Warehouse} tone="neutral" value={counts.yard} label={tx("ops_tab_yard")} to="/boxes?tab=yard" />
          <Tile icon={Stamp} tone="warning" value={counts.customs} label={tx("ops_bx_tileHold")} to="/boxes?tab=customs" />
          <Tile
            icon={Timer}
            tone={freeOverdue ? "danger" : freeSoon ? "warning" : "success"}
            value={freeSoon}
            label={tx("ops_bx_tileFree")}
            to="/boxes?tab=attention"
          />
        </TileRow>
        <FilterBar
          tabs={{
            value: tab,
            onChange: setTab,
            options: TABS.map((t) => ({ value: t, label: tx(`ops_tab_${t}`), count: counts[t] })),
          }}
          search={{ value: search, onChange: setSearch, placeholder: tx("ops_box_search") }}
          selects={[
            { key: "cust", placeholder: tx("ops_col_customer"), value: customerFilter, onChange: setCustomerFilter, options: customerOptions, width: 180 },
            { key: "type", placeholder: tx("ops_col_type"), value: typeFilter, onChange: setTypeFilter, options: typeOptions, width: 110 },
          ]}
          onClear={clearFilters}
          count={filtered.length}
          extra={<ViewSwitch value={view} onChange={setView} labels={{ cards: tx("viewCards"), list: tx("viewList") }} />}
        />
      </PageHeader>

      {!shell && !live ? (
        <p className="cz-muted">{tx("ops_notConnected")}</p>
      ) : view === "cards" ? (
        live && liveQ.isLoading ? null : filtered.length === 0 ? (
          <EmptyState
            title={rows.length ? tx("noResults") : tx("ops_box_none")}
            action={
              rows.length ? (
                <Button onClick={clearFilters}>{tx("clearFilters")}</Button>
              ) : canEdit ? (
                <Button type="primary" onClick={() => setCreateOpen(true)}>
                  {tx("ops_box_create")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="bx-sections">
            {sections.map((sec) => {
              const items = filtered.filter((r) => boxMeta(r.status).group === sec.key).sort((a, b) => severity(b) - severity(a));
              if (!items.length) return null;
              return (
                <section key={sec.key} aria-label={sec.title}>
                  <header className="bx-section-head">
                    <IconBadge icon={sec.icon} tone={sec.tone} size={32} />
                    <h2>{sec.title}</h2>
                    <span className={`bx-count is-${sec.tone}`}>{items.length}</span>
                  </header>
                  <CardGrid min={300}>
                    {items.map((r) => renderBoxCard(r))}
                  </CardGrid>
                </section>
              );
            })}
          </div>
        )
      ) : (
        narrow ? (
          <OpsMobileList
            items={filtered.map((r) => {
              const alert = alertOf(r);
              return {
                key: r.id,
                title: <span className="cz-mono">{r.containerNo}</span>,
                status: <StatusTag status={r.status} label={boxStatusLabel(tx, r.status)} tone={boxMeta(r.status).tone} />,
                line2: (
                  <>
                    <span>{customerNameOf(r.customerId)}</span>
                    <span className="cz-muted">{r.type}</span>
                    <span className="cz-muted">{r.location}</span>
                  </>
                ),
                line3: alert ? <span className={`ops-alert is-${alert.tone}`}>{alert.text}</span> : undefined,
                tone: alert?.tone === "danger" ? "danger" : undefined,
                onClick: () => setOpenId(r.id),
              };
            })}
            emptyText={rows.length ? tx("noResults") : tx("ops_box_none")}
          />
        ) : (
        <DataTable<Row>
          rowKey="id"
          loading={live && liveQ.isLoading}
          columns={columns}
          dataSource={filtered}
          onRowClick={(r) => setOpenId(r.id)}
          emptyText={rows.length ? tx("noResults") : tx("ops_box_none")}
          emptyAction={
            rows.length ? (
              <Button onClick={clearFilters}>{tx("clearFilters")}</Button>
            ) : canEdit ? (
              <Button type="primary" onClick={() => setCreateOpen(true)}>
                {tx("ops_box_create")}
              </Button>
            ) : undefined
          }
        />
        )
      )}

      <Drawer
        open={Boolean(open)}
        onClose={() => setOpenId(null)}
        width={460}
        title={open ? <span className="cz-mono">{open.containerNo}</span> : null}
        extra={open ? <StatusTag status={open.status} label={boxStatusLabel(tx, open.status)} tone={boxMeta(open.status).tone} /> : null}
      >
        {open ? (
          <div className="cz-stack">
            <div className="bx-drawer-visual">
              <BoxPortrait no={open.containerNo} type={open.type} tone={boxTone(open)} />
              {openRoute ? (
                <RouteTrack
                  from={open.pol}
                  to={open.pod}
                  fromName={placeName(open.pol, locale)}
                  toName={placeName(open.pod, locale)}
                  progress={boxMeta(open.status).group === "sea" ? seaProgress(open.eta) : null}
                  toDate={parseOpsDate(open.eta) ? `ETA ${fmtOpsDate(open.eta, locale)}` : undefined}
                  delayed={(daysFromToday(open.eta) ?? 0) < 0}
                />
              ) : (
                <PlaceChip name={open.location} />
              )}
              {openFree ? <FreeTimeBar daysLeft={openFree.daysLeft} labels={freeLabels(openFree.daysLeft)} hint={openFree.estimated ? tx("ops_bx_freeEst", { n: FREE_DAYS }) : undefined} /> : null}
            </div>
            {openAlert ? <div className={`ops-callout is-${openAlert.tone}`}>{openAlert.text}</div> : null}
            <Descriptions
              column={1}
              size="small"
              colon={false}
              className="ops-desc"
              items={[
                { key: "c", label: tx("ops_col_customer"), children: customerNameOf(open.customerId) },
                {
                  key: "j",
                  label: tx("ops_col_job"),
                  children: openJobNo ? <Link to={`/jobs/${open.jobId}`}>{openJobNo}</Link> : tx("ops_noJob"),
                },
                { key: "t", label: tx("ops_col_type"), children: `${open.type} · ${open.teu} TEU · ${open.direction === "out" ? tx("ops_dir_out") : tx("ops_dir_in")}` },
                ...(openRoute ? [{ key: "l", label: tx("ops_col_location"), children: open.location || "—" }] : []),
                { key: "v", label: tx("ops_col_vessel"), children: [open.vessel, open.carrier].filter(Boolean).join(" · ") || "—" },
                ...(openRoute
                  ? []
                  : [
                      { key: "lane", label: tx("ops_col_lane"), children: open.pol || open.pod ? fmtLane(open.pol, open.pod) : "—" },
                      { key: "eta", label: "ETA", children: fmtOpsDate(open.eta, locale) },
                    ]),
                ...(open.lastFreeDay && open.lastFreeDay !== "—"
                  ? [{ key: "lfd", label: tx("ops_lastFreeDay"), children: fmtOpsDate(open.lastFreeDay, locale) }]
                  : []),
                { key: "bl", label: "B/L", children: <span className="cz-mono">{open.bl || "—"}</span> },
                ...(open.seal ? [{ key: "seal", label: tx("ops_seal"), children: <span className="cz-mono">{open.seal}</span> }] : []),
                ...(open.commodity ? [{ key: "com", label: tx("ops_commodity"), children: open.commodity }] : []),
              ]}
            />
            {shell && canEdit ? (
              <div className="ops-field">
                <label htmlFor="ops-box-status">{tx("ops_changeStatus")}</label>
                <Select
                  id="ops-box-status"
                  value={open.status}
                  onChange={(v) => {
                    ops.setBoxStatus(open.id, v as ShellBoxStatus);
                    message.success(tx("ops_statusSaved"));
                  }}
                  options={SHELL_BOX_STATUSES.map((s) => ({ value: s, label: boxStatusLabel(tx, s) }))}
                />
              </div>
            ) : null}
            <Space wrap>
              {open.jobId ? (
                <Link to={`/docs?jobId=${open.jobId}`}>
                  <Button>{tx("ops_viewDocs")}</Button>
                </Link>
              ) : null}
              {boxMeta(open.status).group === "yard" ? (
                <Link to="/yard">
                  <Button icon={<MapTrifold size={16} />}>{tx("ops_yard_open")}</Button>
                </Link>
              ) : null}
              {shell && canEdit ? (
                <Button icon={<ArrowClockwise size={16} />} loading={busyId === open.id} onClick={() => void refreshTracking(open)}>
                  {tx("ops_refreshTracking")}
                </Button>
              ) : null}
            </Space>
          </div>
        ) : null}
      </Drawer>

      <CreateContainerDrawer open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

type CreateValues = { containerNo: string; customerId: string; type: string; direction: "in" | "out"; slot?: string; bl?: string; teu: number };

function CreateContainerDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tx } = useStore();
  const { shell } = useAppMode();
  const ops = useShellOps();
  const qc = useQueryClient();
  const { message } = App.useApp();
  const { customers } = useCustomerLookup();
  const customerNameOf = useCustomerName();
  const [form] = Form.useForm<CreateValues>();

  const create = useMutation({
    mutationFn: async (v: CreateValues) => {
      if (shell) {
        const fail = ops.addBox({
          id: v.containerNo,
          customerId: v.customerId,
          type: v.type,
          dir: v.direction,
          status: "gate_in",
          slot: v.slot,
          bl: v.bl ?? "",
          teu: v.teu,
        });
        if (fail) throw new Error(tx("ops_box_duplicate"));
        return;
      }
      await createContainerApi({
        customerId: v.customerId,
        containerNo: v.containerNo.trim().toUpperCase(),
        type: v.type,
        direction: v.direction,
        status: "yard",
        bl: v.bl || undefined,
        yardCode: v.slot ? `LCB-${v.slot}` : undefined,
        teu: v.teu,
      });
      await qc.invalidateQueries({ queryKey: queryKeys.containers.all });
    },
    onSuccess: () => {
      message.success(tx("ops_box_created"));
      form.resetFields();
      onClose();
    },
    onError: (e: Error) => message.error(e.message),
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={440}
      title={tx("ops_box_create")}
      footer={
        <div className="ops-drawer-foot">
          <Button type="text" onClick={onClose}>
            {tx("ops_cancel")}
          </Button>
          <Button type="primary" loading={create.isPending} onClick={() => form.submit()}>
            {tx("ops_save")}
          </Button>
        </div>
      }
    >
      <Form<CreateValues>
        form={form}
        layout="vertical"
        requiredMark
        initialValues={{ type: "40HC", direction: "in", teu: 2, slot: "A1" }}
        onFinish={(v) => create.mutate(v)}
      >
        <Form.Item name="containerNo" label={tx("ops_col_container")} rules={[{ required: true, message: tx("ops_required") }]}>
          <Input className="cz-mono" placeholder="MSCU1234567" autoFocus />
        </Form.Item>
        <Form.Item name="customerId" label={tx("ops_col_customer")} rules={[{ required: true, message: tx("ops_required") }]}>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={tx("ops_pickCustomer")}
            options={customers.map((c) => ({ value: c.id, label: customerNameOf(c.id) }))}
          />
        </Form.Item>
        <div className="ops-form-row">
          <Form.Item name="type" label={tx("ops_col_type")}>
            <Select options={["20GP", "40GP", "40HC", "45HC"].map((t) => ({ value: t, label: t }))} />
          </Form.Item>
          <Form.Item name="teu" label="TEU">
            <InputNumber min={1} max={4} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <div className="ops-form-row">
          <Form.Item name="direction" label={tx("ops_direction")}>
            <Select
              options={[
                { value: "in", label: tx("ops_dir_in") },
                { value: "out", label: tx("ops_dir_out") },
              ]}
            />
          </Form.Item>
          <Form.Item name="slot" label={tx("ops_yard_slot")}>
            <Select options={YARD_SLOTS.map((s) => ({ value: s, label: s }))} />
          </Form.Item>
        </div>
        <Form.Item name="bl" label="B/L">
          <Input className="cz-mono" />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
