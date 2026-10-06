import { ChatCircleText, GearSix, Plus, Timer, Tray, WarningCircle, type Icon } from "@phosphor-icons/react";
import { Button, Switch, Tooltip } from "antd";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CASE_CATEGORIES,
  CASE_PRIORITIES,
  CASE_STATUSES,
  type CaseCategory,
  type CaseDto,
  type CaseListParams,
  type CasePriority,
  type CaseStatus,
} from "../../../api/cases.ts";
import { useStore } from "../../../store";
import {
  Board,
  DataTable,
  EmptyState,
  EntityCard,
  ErrorState,
  FilterBar,
  LoadingState,
  PageHeader,
  PersonAvatar,
  Tile,
  TileRow,
  ViewSwitch,
  readView,
  writeView,
} from "../../components";
import { useCan } from "../../hooks/useCan.ts";
import { useCaseStats, useCases } from "../../hooks/useCases.ts";
import { useUserLookup } from "../../hooks/useUserLookup.ts";
import { CaseCreateDrawer, type CasePrefill } from "./CaseCreateDrawer.tsx";
import { CaseSettingsDrawer } from "./CaseSettingsDrawer.tsx";
import {
  CategoryIcon,
  ChannelIcon,
  PriorityMeter,
  SlaChip,
  STATUS_LOOK,
  customerLabel,
  fmtDuration,
  liveSla,
  useNow,
} from "./caseLook.tsx";
import "./cases.css";

type Scope = "mine" | "all" | "unassigned";
const BOARD: CaseStatus[] = ["new", "in_progress", "waiting_customer", "resolved"];
const PAGE = 50;

export function CasesPage() {
  const { tx, locale } = useStore();
  const can = useCan();
  const navigate = useNavigate();
  const { nameOf } = useUserLookup();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState(() => readView("cases", "cards"));
  const [limit, setLimit] = useState(PAGE);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const scope: Scope = params.get("scope") === "all" ? "all" : params.get("scope") === "unassigned" ? "unassigned" : params.get("scope") === "mine" ? "mine" : can("case.edit") ? "mine" : "all";
  const q = params.get("q") ?? "";
  const priority = (CASE_PRIORITIES as readonly string[]).includes(params.get("priority") ?? "") ? (params.get("priority") as CasePriority) : undefined;
  const category = (CASE_CATEGORIES as readonly string[]).includes(params.get("category") ?? "") ? (params.get("category") as CaseCategory) : undefined;
  const overdue = params.get("overdue") === "1";
  const statusParam = params.get("status") ?? "open";
  const listStatus = (["open", "all", ...CASE_STATUSES] as string[]).includes(statusParam) ? (statusParam as CaseListParams["status"]) : "open";

  const creating = params.get("new") === "1";
  const prefill: CasePrefill = {
    customerId: params.get("customerId") ?? undefined,
    subject: params.get("subject") ?? undefined,
    description: params.get("body") ?? undefined,
    sourceMailId: params.get("mailId") ?? undefined,
    channel: params.get("mailId") ? "email" : undefined,
  };

  const setParam = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
    setLimit(PAGE);
  };

  const common: CaseListParams = {
    assignee: scope,
    priority,
    category,
    overdue,
    q: q.trim() || undefined,
  };
  const listParams: CaseListParams = view === "cards" ? { ...common, status: "board", limit: 300 } : { ...common, status: listStatus, limit };
  const list = useCases(listParams);
  const stats = useCaseStats();

  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const s = stats.data;

  const tabs = [
    { value: "mine", label: tx("cs_scope_mine"), count: s?.mine },
    { value: "all", label: tx("cs_scope_all"), count: s?.open },
    { value: "unassigned", label: tx("cs_scope_unassigned"), count: s?.unassigned },
  ];

  const card = (c: CaseDto) => {
    const sla = liveSla(c, now);
    const tone = sla.current?.state === "breached" ? "danger" : sla.current?.state === "warning" ? "warning" : "default";
    const cust = customerLabel(c, locale, tx("cs_no_customer"));
    const owner = c.assigneeUserId ? nameOf(c.assigneeUserId, "") : "";
    return (
      <EntityCard
        key={c.id}
        to={`/cases/${c.id}`}
        tone={tone}
        title={<span className="cs-card-no">{c.caseNo}</span>}
        badge={<SlaChip t={sla.current ?? (c.status === "resolved" ? sla.resolve : null)} tx={tx} which={sla.active} />}
        footer={
          <span className="cs-card-foot">
            <span className="cs-card-cust">
              <PersonAvatar name={cust} size={22} />
              <span>{cust}</span>
            </span>
            <span className="cs-card-meta">
              <ChannelIcon channel={c.channel} tx={tx} />
              <PriorityMeter priority={c.priority} tx={tx} />
              {owner ? (
                <Tooltip title={`${tx("cs_assignee")}: ${owner}`}>
                  <span>
                    <PersonAvatar name={owner} size={24} />
                  </span>
                </Tooltip>
              ) : (
                <Tooltip title={tx("cs_unassigned")}>
                  <span className="cs-noowner" aria-label={tx("cs_unassigned")} />
                </Tooltip>
              )}
            </span>
          </span>
        }
      >
        <span className="cs-card-body">
          <CategoryIcon category={c.category} tx={tx} size={16} />
          <span className="cs-card-subject">{c.subject}</span>
        </span>
      </EntityCard>
    );
  };

  const columns = [
    {
      key: "case",
      title: tx("cs_col_case"),
      render: (_: unknown, c: CaseDto) => (
        <span className="cs-row-case">
          <CategoryIcon category={c.category} tx={tx} size={16} />
          <span>
            <span className="cz-cell-main">{c.caseNo}</span>
            <span className="cz-cell-sub cs-row-subject">{c.subject}</span>
          </span>
        </span>
      ),
    },
    {
      key: "customer",
      title: tx("cs_col_customer"),
      render: (_: unknown, c: CaseDto) => {
        const n = customerLabel(c, locale, "—");
        return (
          <span className="cs-row-cust">
            <PersonAvatar name={n} size={22} />
            {n}
          </span>
        );
      },
    },
    {
      key: "status",
      title: tx("cs_status"),
      render: (_: unknown, c: CaseDto) => <StatusPill status={c.status} tx={tx} />,
    },
    {
      key: "sla",
      title: tx("cs_col_sla"),
      render: (_: unknown, c: CaseDto) => {
        const sla = liveSla(c, now);
        return (
          <span className="cs-row-sla">
            <PriorityMeter priority={c.priority} tx={tx} />
            <SlaChip t={sla.current ?? sla.resolve} tx={tx} which={sla.active} />
          </span>
        );
      },
    },
    {
      key: "owner",
      title: tx("cs_assignee"),
      render: (_: unknown, c: CaseDto) => {
        const owner = c.assigneeUserId ? nameOf(c.assigneeUserId, "") : "";
        return owner ? (
          <span className="cs-row-cust">
            <PersonAvatar name={owner} size={22} />
            {owner}
          </span>
        ) : (
          <span className="cz-muted">{tx("cs_unassigned")}</span>
        );
      },
    },
  ];

  const filtered = Boolean(q || priority || category || overdue || scope !== "mine");
  const empty = (
    <EmptyState
      title={filtered ? tx("cs_empty_filtered") : tx("cs_empty_title")}
      description={filtered ? undefined : tx("cs_empty_desc")}
      action={
        can("case.edit") && !filtered ? (
          <Button type="primary" icon={<Plus size={16} />} onClick={() => setParam({ new: "1" })}>
            {tx("cs_new")}
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <div className="cz-stack cs-page">
      <PageHeader
        title={tx("cs_title")}
        extra={
          <>
            {can("case.manage") ? (
              <Button icon={<GearSix size={16} />} onClick={() => setSettingsOpen(true)}>
                {tx("cs_settings")}
              </Button>
            ) : null}
            {can("case.edit") ? (
              <Button type="primary" icon={<Plus size={16} />} onClick={() => setParam({ new: "1" })}>
                {tx("cs_new")}
              </Button>
            ) : null}
          </>
        }
      />

      <TileRow>
        <Tile icon={Tray} tone="primary" value={s?.open ?? "—"} label={tx("cs_tile_open")} />
        <Tile
          icon={WarningCircle}
          tone={s && s.overdue > 0 ? "danger" : "success"}
          value={s?.overdue ?? "—"}
          label={tx("cs_tile_overdue")}
          to={overdue ? "/cases" : "/cases?scope=all&overdue=1"}
        />
        <Tile icon={Timer} tone={s && s.dueToday > 0 ? "warning" : "neutral"} value={s?.dueToday ?? "—"} label={tx("cs_tile_due_today")} />
        <Tile
          icon={ChatCircleText}
          tone="info"
          value={s?.avgFirstResponseMinutes != null ? fmtDuration(tx, s.avgFirstResponseMinutes) : "—"}
          label={tx("cs_tile_avg_first")}
        />
      </TileRow>

      <FilterBar
        tabs={{ value: scope, options: tabs, onChange: (v) => setParam({ scope: v }) }}
        search={{ value: q, onChange: (v) => setParam({ q: v || undefined }), placeholder: tx("cs_search") }}
        selects={[
          ...(view === "list"
            ? [
                {
                  key: "status",
                  placeholder: tx("cs_status"),
                  value: listStatus === "open" ? undefined : listStatus,
                  options: [
                    { value: "all", label: tx("cs_status_all") },
                    ...CASE_STATUSES.map((v) => ({ value: v, label: tx(`cs_status_${v}`), count: list.data?.counts[v] })),
                  ],
                  onChange: (v: string | undefined) => setParam({ status: v }),
                  width: 150,
                },
              ]
            : []),
          {
            key: "priority",
            placeholder: tx("cs_priority"),
            value: priority,
            options: CASE_PRIORITIES.map((v) => ({ value: v, label: tx(`cs_pri_${v}`) })),
            onChange: (v) => setParam({ priority: v }),
            width: 130,
          },
          {
            key: "category",
            placeholder: tx("cs_category"),
            value: category,
            options: CASE_CATEGORIES.map((v) => ({ value: v, label: tx(`cs_cat_${v}`) })),
            onChange: (v) => setParam({ category: v }),
            width: 180,
          },
        ]}
        onClear={() => setParams(new URLSearchParams({ scope: "mine" }), { replace: true })}
        extra={
          <>
            <label className="cs-overdue-toggle">
              <Switch size="small" checked={overdue} onChange={(v) => setParam({ overdue: v ? "1" : undefined })} />
              <span>{tx("cs_overdue_only")}</span>
            </label>
            <ViewSwitch
              value={view}
              onChange={(v) => {
                setView(v);
                writeView("cases", v);
              }}
              labels={{ cards: tx("cs_view_board"), list: tx("cs_view_list") }}
            />
          </>
        }
      />

      {list.isLoading ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState title={tx("cs_error")} action={<Button onClick={() => list.refetch()}>{tx("retry")}</Button>} />
      ) : !items.length ? (
        empty
      ) : view === "cards" ? (
        <Board
          columns={BOARD.map((st) => {
            const col = items.filter((c) => c.status === st);
            return {
              key: st,
              icon: STATUS_LOOK[st].icon as Icon,
              tone: STATUS_LOOK[st].tone,
              title: tx(`cs_status_${st}`),
              count: col.length,
              children: col.length ? col.map(card) : <span className="cs-col-empty" aria-hidden />,
            };
          })}
        />
      ) : (
        <>
          <DataTable<CaseDto>
            rowKey="id"
            dataSource={items}
            columns={columns}
            pagination={false}
            onRowClick={(c) => navigate(`/cases/${c.id}`)}
          />
          {list.data && list.data.total > items.length ? (
            <div className="cs-more">
              <Button onClick={() => setLimit((n) => n + PAGE)} loading={list.isFetching}>
                {tx("cs_load_more")}
              </Button>
            </div>
          ) : null}
        </>
      )}

      <CaseCreateDrawer
        open={creating}
        prefill={prefill}
        onClose={() => setParam({ new: undefined, customerId: undefined, subject: undefined, body: undefined, mailId: undefined })}
        onCreated={(c) => navigate(`/cases/${c.id}`)}
      />
      {can("case.manage") ? <CaseSettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}

export function StatusPill({ status, tx }: { status: CaseStatus; tx: (k: string) => string }) {
  const look = STATUS_LOOK[status];
  return (
    <span className={`cs-status is-${look.tone}`}>
      <look.icon size={14} weight="fill" aria-hidden />
      {tx(`cs_status_${status}`)}
    </span>
  );
}
