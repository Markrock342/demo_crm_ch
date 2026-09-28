import { Bell, Fire, Lightning } from "@phosphor-icons/react";
import { Button } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "../../store";
import {
  AiBriefCard,
  Board,
  DataTable,
  EmptyState,
  FilterBar,
  LoadingState,
  PageHeader,
  Panel,
  StatusTag,
  ViewSwitch,
  readView,
  writeView,
} from "../components";
import { useAppMode } from "../hooks/useAppMode.ts";
import { useMedia } from "../../ui/useMedia";
import {
  AgeChip,
  AttentionCard,
  AttentionList,
  Reason,
} from "./home/AttentionList.tsx";
import {
  KINDS,
  SEVERITY_TONE,
  useAttentionItems,
  type AttentionItem,
  type AttentionKind,
  type Severity,
} from "./home/attention.ts";
import "./home/home.css";

const SEV_COLS: { key: Severity; icon: typeof Fire }[] = [
  { key: "high", icon: Fire },
  { key: "medium", icon: Lightning },
  { key: "low", icon: Bell },
];

export function ExceptionsPageV2() {
  const { tx } = useStore();
  const { enabled } = useAppMode();
  const navigate = useNavigate();
  const narrow = useMedia("(max-width: 640px)");
  const [params, setParams] = useSearchParams();
  const { items, loading } = useAttentionItems();
  const [q, setQ] = useState("");
  const [view, setView] = useState(() => readView("exceptions"));

  const sev = (params.get("severity") as Severity | null) ?? "all";
  const kind = (params.get("kind") as AttentionKind | null) ?? undefined;

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  const kindFiltered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => {
      if (kind && i.kind !== kind) return false;
      if (!needle) return true;
      return `${i.ref} ${i.customer} ${i.reason}`
        .toLowerCase()
        .includes(needle);
    });
  }, [items, kind, q]);

  const rows =
    sev === "all"
      ? kindFiltered
      : kindFiltered.filter((i) => i.severity === sev);
  const countSev = (s: Severity) =>
    kindFiltered.filter((i) => i.severity === s).length;
  const urgent = items.filter((i) => i.severity === "high").length;

  const facts = useMemo(() => {
    const f: Record<string, number> = { total: items.length, urgent };
    for (const k of KINDS) f[k] = items.filter((i) => i.kind === k).length;
    return f;
  }, [items, urgent]);
  const localBrief = `${items.length} items need attention (${urgent} urgent): ${KINDS.map((k) => `${facts[k]} ${k}`).join(", ")}.`;

  const columns: ColumnsType<AttentionItem> = [
    {
      title: tx("home_col_ref"),
      key: "ref",
      width: 220,
      render: (_, r) => (
        <>
          <span className={`cz-cell-main${r.refMono ? " cz-mono" : ""}`}>
            {r.ref}
          </span>
          <span className="cz-cell-sub">{r.customer}</span>
        </>
      ),
    },
    {
      title: tx("home_col_severity"),
      key: "severity",
      width: 110,
      render: (_, r) => (
        <StatusTag
          status={r.severity}
          tone={SEVERITY_TONE[r.severity]}
          label={tx(`home_sev_${r.severity}`)}
        />
      ),
    },
    {
      title: tx("home_col_problem"),
      key: "problem",
      render: (_, r) => <Reason item={r} />,
    },
    {
      title: tx("home_col_age"),
      key: "age",
      width: 110,
      render: (_, r) => <AgeChip days={r.ageDays} />,
    },
    {
      title: tx("home_col_next"),
      key: "next",
      render: (_, r) => (
        <span className="hm-next">
          <span>{r.action}</span>
          <Link to={r.to} className="cz-link-btn">
            {tx("home_open")}
          </Link>
        </span>
      ),
    },
  ];

  if (!enabled) {
    return (
      <PageHeader
        title={tx("navActionCenter")}
        subtitle={tx("home_not_connected")}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={tx("navActionCenter")}
        subtitle={
          items.length
            ? tx("home_exc_sub", { n: items.length, u: urgent })
            : tx("home_sub_clear")
        }
        extra={
          <AiBriefCard
            title={tx("home_ai_exc_title")}
            facts={facts}
            localFallback={localBrief}
            context="exceptions"
          />
        }
      >
        <FilterBar
          tabs={{
            value: sev,
            onChange: (v) => setParam("severity", v),
            options: [
              {
                value: "all",
                label: tx("home_filter_all"),
                count: kindFiltered.length,
              },
              {
                value: "high",
                label: tx("home_sev_high"),
                count: countSev("high"),
              },
              {
                value: "medium",
                label: tx("home_sev_medium"),
                count: countSev("medium"),
              },
              {
                value: "low",
                label: tx("home_sev_low"),
                count: countSev("low"),
              },
            ],
          }}
          search={{
            value: q,
            onChange: setQ,
            placeholder: tx("home_exc_search"),
          }}
          selects={[
            {
              key: "kind",
              placeholder: tx("home_filter_kind"),
              value: kind,
              onChange: (v) => setParam("kind", v),
              options: KINDS.map((k) => ({
                value: k,
                label: `${tx(`home_kind_${k}`)} (${items.filter((i) => i.kind === k).length})`,
              })),
            },
          ]}
          onClear={() => {
            setQ("");
            setParams(new URLSearchParams(), { replace: true });
          }}
          count={rows.length}
          extra={
            <ViewSwitch
              value={view}
              onChange={(v) => {
                setView(v);
                writeView("exceptions", v);
              }}
              labels={{ cards: tx("home_view_board"), list: tx("viewList") }}
            />
          }
        />
      </PageHeader>

      {loading ? (
        <Panel>
          <LoadingState />
        </Panel>
      ) : items.length === 0 ? (
        <Panel>
          <EmptyState
            title={tx("home_attn_empty_title")}
            description={tx("home_attn_empty_desc")}
            action={
              <Button onClick={() => navigate("/jobs")}>
                {tx("home_go_jobs")}
              </Button>
            }
          />
        </Panel>
      ) : view === "cards" ? (
        <div className="hm-exc-board">
          <Board
            columns={SEV_COLS.filter((c) => sev === "all" || sev === c.key).map(
              (c) => {
                const col = rows.filter((r) => r.severity === c.key);
                return {
                  key: c.key,
                  icon: c.icon,
                  tone: SEVERITY_TONE[c.key],
                  title: tx(`home_sev_${c.key}`),
                  count: col.length,
                  children: col.length ? (
                    col.map((it) => <AttentionCard key={it.id} item={it} />)
                  ) : (
                    <p className="hm-quiet hm-col-empty">
                      {tx("home_col_empty")}
                    </p>
                  ),
                };
              },
            )}
          />
        </div>
      ) : (
        <Panel flush>
          {narrow ? (
            rows.length ? (
              <AttentionList items={rows} showAction />
            ) : (
              <EmptyState description={tx("home_exc_no_match")} />
            )
          ) : (
            <DataTable<AttentionItem>
              rowKey="id"
              columns={columns}
              dataSource={rows}
              onRowClick={(r) => navigate(r.to)}
              emptyText={tx("home_exc_no_match")}
            />
          )}
        </Panel>
      )}
    </>
  );
}
