import { ArrowsClockwise, Checks } from "@phosphor-icons/react";
import { App, Button } from "antd";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { AppNotification, RuleKey } from "../api/notifications.ts";
import type { Locale } from "../i18n";
import { useStore } from "../store";
import { EmptyState, ErrorState, FilterBar, IconBadge, LoadingState, PageHeader, Panel } from "../v2/components";
import { useAppMode } from "../v2/hooks/useAppMode.ts";
import { useCustomerLookup } from "../v2/hooks/useCustomerLookup.ts";
import { useMarkRead, useNotificationFeed } from "../v2/hooks/useNotifications.ts";
import { fmtDate } from "../v2/lib/format.ts";
import { notificationText, RULE_LOOK, RULE_ORDER, ruleLook } from "./notifyLook.ts";
import "./notify.css";

const MONO_KINDS = new Set(["free_time"]);

function dayKey(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function timeOf(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale === "th" ? "th-TH" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function NotificationsPage() {
  const { tx, locale } = useStore();
  const loc = locale as Locale;
  const { message } = App.useApp();
  const { enabled } = useAppMode();
  const { nameOf } = useCustomerLookup();
  const feed = useNotificationFeed();
  const { markRead, markAllRead, markingAll } = useMarkRead();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [kind, setKind] = useState<RuleKey | null>(null);

  const items = useMemo(() => feed.data?.items ?? [], [feed.data]);
  const unread = items.filter((n) => !n.read).length;

  const kindCounts = useMemo(() => {
    const m = new Map<string, { total: number; unread: number }>();
    for (const n of items) {
      const c = m.get(n.kind) ?? { total: 0, unread: 0 };
      c.total++;
      if (!n.read) c.unread++;
      m.set(n.kind, c);
    }
    return m;
  }, [items]);

  const shown = items.filter((n) => (filter === "unread" ? !n.read : true) && (!kind || n.kind === kind));

  const groups = useMemo(() => {
    const today = dayKey(new Date());
    const map = new Map<number, AppNotification[]>();
    for (const n of shown) {
      const k = dayKey(new Date(n.createdAt));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(n);
    }
    return [...map.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([k, rows]) => {
        const ago = Math.round((today - k) / 86_400_000);
        const label = ago === 0 ? tx("home_today") : ago === 1 ? tx("home_yesterday") : fmtDate(new Date(k), loc);
        return { key: k, label, rows };
      });
  }, [loc, shown, tx]);

  async function markAll() {
    try {
      await markAllRead();
      message.success(tx("home_notif_all_read_done"));
    } catch {
      message.error(tx("nt_error"));
    }
  }

  if (!enabled) {
    return <PageHeader title={tx("navNotifications")} subtitle={tx("home_not_connected")} />;
  }

  return (
    <>
      <PageHeader
        title={tx("navNotifications")}
        subtitle={unread ? tx("home_notif_sub", { n: unread }) : tx("home_notif_sub_none")}
        extra={
          <>
            <Button
              icon={<ArrowsClockwise size={16} />}
              onClick={() => void feed.refetch()}
              loading={feed.isFetching && !feed.isLoading}
              aria-label={tx("home_notif_refresh")}
            >
              <span className="nt-hide-sm">{tx("home_notif_refresh")}</span>
            </Button>
            <Button type="primary" icon={<Checks size={16} />} disabled={!unread} loading={markingAll} onClick={() => void markAll()}>
              {tx("home_notif_mark_all")}
            </Button>
          </>
        }
      >
        <FilterBar
          tabs={{
            value: filter,
            onChange: (v) => setFilter(v as "all" | "unread"),
            options: [
              { value: "all", label: tx("home_filter_all"), count: items.length },
              { value: "unread", label: tx("home_notif_unread"), count: unread },
            ],
          }}
        />
        {kindCounts.size ? (
          <div className="nt-kinds" role="group" aria-label={tx("home_filter_all")}>
            {RULE_ORDER.filter((k) => kindCounts.has(k)).map((k) => {
              const c = kindCounts.get(k)!;
              const look = RULE_LOOK[k];
              const active = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  className={`nt-kind${active ? " is-active" : ""}`}
                  aria-pressed={active}
                  onClick={() => setKind(active ? null : k)}
                >
                  <IconBadge icon={look.icon} tone={look.tone} size={26} />
                  <span>{tx(`nt_kind_${k}`)}</span>
                  <b className={c.unread ? "is-hot" : undefined}>{filter === "unread" ? c.unread : c.total}</b>
                </button>
              );
            })}
          </div>
        ) : null}
      </PageHeader>

      {feed.isLoading ? (
        <LoadingState />
      ) : feed.error ? (
        <ErrorState title={tx("nt_error")} />
      ) : groups.length ? (
        <div className="cz-stack">
          {groups.map((g) => (
            <Panel key={g.key} title={g.label} flush>
              <ul className="nt-feed">
                {g.rows.map((n) => {
                  const look = ruleLook(n.kind);
                  const cid = typeof n.params?.customerId === "string" ? n.params.customerId : null;
                  const customer = cid ? nameOf(cid) : "—";
                  return (
                    <li key={n.id}>
                      <Link
                        to={n.href || "/notifications"}
                        onClick={() => {
                          if (!n.read) markRead(n.id);
                        }}
                        className={`nt-row${n.read ? "" : " is-unread"}`}
                      >
                        <IconBadge icon={look.icon} tone={n.read ? "neutral" : look.tone} size={38} />
                        <span className="nt-row-main">
                          <span className="nt-row-top">
                            <strong className={MONO_KINDS.has(n.kind) ? "cz-mono" : undefined}>{n.title}</strong>
                            <span className={`nt-chip is-${look.tone}`}>{tx(`nt_kind_${n.kind}`)}</span>
                          </span>
                          <span className="nt-row-body">{notificationText(tx, n, loc)}</span>
                        </span>
                        <span className="nt-row-side">
                          {customer !== "—" ? <span className="nt-row-cust">{customer}</span> : null}
                          <time dateTime={n.createdAt}>{timeOf(n.createdAt, loc)}</time>
                        </span>
                        {n.read ? (
                          <span className="nt-dot-space" />
                        ) : (
                          <span className="nt-dot" role="img" aria-label={tx("home_notif_unread")} />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <EmptyState
            title={filter === "unread" ? tx("nt_emptyUnread") : tx("nt_emptyTitle")}
            description={filter === "unread" ? undefined : tx("nt_emptyDesc")}
            action={
              filter === "unread" || kind ? (
                <Button
                  onClick={() => {
                    setFilter("all");
                    setKind(null);
                  }}
                >
                  {tx("home_notif_show_all")}
                </Button>
              ) : (
                <Link to="/automation">
                  <Button type="primary">{tx("nt_seeRules")}</Button>
                </Link>
              )
            }
          />
        </Panel>
      )}
    </>
  );
}
