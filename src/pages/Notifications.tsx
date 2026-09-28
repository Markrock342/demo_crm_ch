import { ArrowsClockwise, Clock, FileText, Package, Receipt, UserCircleDashed, Warning } from "@phosphor-icons/react";
import { App, Button } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Locale } from "../i18n";
import { useShellBilling } from "../shell/billingStore.tsx";
import { useShellJobs } from "../shell/jobStore.tsx";
import { useShellNotifications } from "../shell/notificationStore.tsx";
import { useShellOps } from "../shell/opsStore.tsx";
import { useShellSupport } from "../shell/supportStore.tsx";
import { useStore } from "../store";
import { EmptyState, FilterBar, IconBadge, PageHeader, Panel } from "../v2/components";
import type { Tone } from "../v2/components/Graphics.tsx";
import { useAppMode } from "../v2/hooks/useAppMode.ts";
import { useCustomerLookup } from "../v2/hooks/useCustomerLookup.ts";
import { fmtDate } from "../v2/lib/format.ts";
import { daysAgo, parseLooseDate, useAttentionItems } from "../v2/pages/home/attention.ts";
import "../v2/pages/home/home.css";

type FeedItem = {
  id: string;
  kind: string;
  title: string;
  mono?: boolean;
  customer: string;
  body: string;
  href: string;
  date: Date;
  read: boolean;
};

const READ_KEY = "cz-home-notif-read-v1";

function loadRead(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveRead(set: Set<string>) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...set]));
  } catch {
    /* storage unavailable — read state stays in memory */
  }
}

const KIND_ICON: Record<string, typeof Clock> = {
  delayed: Clock,
  delay: Clock,
  ops: UserCircleDashed,
  owner: UserCircleDashed,
  doc: FileText,
  docs: FileText,
  ar: Receipt,
  box: Package,
  container: Package,
};

const KIND_TONE: Record<string, Tone> = {
  delayed: "danger",
  delay: "danger",
  ops: "info",
  owner: "info",
  doc: "warning",
  docs: "warning",
  ar: "accent",
  box: "primary",
  container: "primary",
};

const FLAG_KEYS: Record<string, string> = {
  demurrage: "home_reason_dem_short",
  ETA: "home_reason_eta_changed",
  "C/O": "home_reason_co",
  doc: "home_reason_box_doc",
  "not returned": "home_reason_not_returned",
};

export function NotificationsPage() {
  const { tx, locale } = useStore();
  const loc = locale as Locale;
  const { message } = App.useApp();
  const { shell, enabled } = useAppMode();
  const note = useShellNotifications();
  const jobs = useShellJobs();
  const billing = useShellBilling();
  const ops = useShellOps();
  const support = useShellSupport();
  const { nameOf } = useCustomerLookup();
  const { items: attention } = useAttentionItems();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [liveRead, setLiveRead] = useState<Set<string>>(() => loadRead());

  useEffect(() => saveRead(liveRead), [liveRead]);

  const feed: FeedItem[] = useMemo(() => {
    if (shell) {
      return note.notifications.map((n) => {
        let customer = "—";
        let body = n.body;
        let mono = false;
        const job = jobs.jobs.find((j) => j.id === n.sourceId);
        if (n.kind === "delayed" || n.kind === "ops") {
          customer = nameOf(job?.customerId);
          body = tx(n.kind === "delayed" ? "home_reason_delay_short" : "home_reason_owner");
        } else if (n.kind === "doc") {
          const d = support.docs.find((x) => x.id === n.sourceId);
          const dj = d?.jobId ? jobs.jobs.find((j) => j.id === d.jobId) : undefined;
          customer = nameOf(dj?.customerId);
          body = tx(n.body === "late" ? "home_reason_doc_late" : "home_reason_doc_wait", { doc: d?.name ?? n.title });
        } else if (n.kind === "ar") {
          const inv = billing.invoices.find((i) => i.id === n.sourceId);
          customer = nameOf(inv?.customerId);
          body = tx("home_notif_ar");
        } else if (n.kind === "box") {
          const b = ops.boxes.find((x) => x.id === n.sourceId);
          customer = nameOf(b?.customerId);
          mono = true;
          body = n.body
            .split(",")
            .map((f) => f.trim())
            .filter(Boolean)
            .map((f) => (FLAG_KEYS[f] ? tx(FLAG_KEYS[f]) : f))
            .join(" · ");
        }
        return {
          id: n.id,
          kind: n.kind,
          title: n.kind === "doc" ? job?.jobNumber ?? n.title : n.title,
          mono,
          customer,
          body,
          href: n.href,
          date: parseLooseDate(n.createdAt) ?? new Date(),
          read: n.read,
        };
      });
    }
    const today = new Date();
    return attention.map((a) => ({
      id: a.id,
      kind: a.kind,
      title: a.ref,
      mono: a.refMono,
      customer: a.customer,
      body: a.reason,
      href: a.to,
      date: today,
      read: liveRead.has(a.id),
    }));
  }, [attention, billing.invoices, jobs.jobs, liveRead, nameOf, note.notifications, ops.boxes, shell, support.docs, tx]);

  const unread = feed.filter((f) => !f.read).length;
  const shown = filter === "unread" ? feed.filter((f) => !f.read) : feed;

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; rows: FeedItem[]; t: number }>();
    for (const f of shown) {
      const d = new Date(f.date.getFullYear(), f.date.getMonth(), f.date.getDate());
      const key = d.toDateString();
      const ago = daysAgo(d);
      const label = ago === 0 ? tx("home_today") : ago === 1 ? tx("home_yesterday") : fmtDate(d, loc);
      if (!map.has(key)) map.set(key, { label, rows: [], t: d.getTime() });
      map.get(key)!.rows.push(f);
    }
    return [...map.values()].sort((a, b) => b.t - a.t);
  }, [loc, shown, tx]);

  const markRead = useCallback(
    (id: string) => {
      if (shell) note.markRead(id);
      else setLiveRead((s) => new Set(s).add(id));
    },
    [note, shell],
  );

  function markAll() {
    if (shell) note.markAllRead();
    else setLiveRead(new Set([...liveRead, ...feed.map((f) => f.id)]));
    message.success(tx("home_notif_all_read_done"));
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
            {shell ? (
              <Button icon={<ArrowsClockwise size={16} />} onClick={() => note.refreshFromShell()}>
                {tx("home_notif_refresh")}
              </Button>
            ) : null}
            <Button type="primary" disabled={!unread} onClick={markAll}>
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
              { value: "all", label: tx("home_filter_all"), count: feed.length },
              { value: "unread", label: tx("home_notif_unread"), count: unread },
            ],
          }}
        />
      </PageHeader>

      {groups.length ? (
        <div className="cz-stack">
          {groups.map((g) => (
            <Panel key={g.label} title={g.label} flush>
              <ul className="hm-feed">
                {g.rows.map((f) => {
                  const Icon = KIND_ICON[f.kind] ?? Warning;
                  return (
                    <li key={f.id}>
                      <Link
                        to={f.href}
                        onClick={() => markRead(f.id)}
                        className={`hm-feed-row${f.read ? "" : " is-unread"}`}
                      >
                        <IconBadge icon={Icon} tone={KIND_TONE[f.kind] ?? "neutral"} size={34} />
                        <span className="hm-feed-line">
                          <strong className={f.mono ? "cz-mono" : undefined}>{f.title}</strong>
                          <span className="hm-feed-body">{f.body}</span>
                        </span>
                        {f.customer !== "—" ? <span className="hm-feed-cust">{f.customer}</span> : null}
                        {f.read ? null : <span className="hm-unread-dot" role="img" aria-label={tx("home_notif_unread")} />}
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
            title={filter === "unread" ? tx("home_notif_empty_unread") : tx("home_notif_empty")}
            description={tx("home_notif_empty_desc")}
            action={filter === "unread" ? <Button onClick={() => setFilter("all")}>{tx("home_notif_show_all")}</Button> : undefined}
          />
        </Panel>
      )}
    </>
  );
}
