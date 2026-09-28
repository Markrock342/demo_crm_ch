import FullCalendar, { type CalendarRef } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import listPlugin from "@fullcalendar/react/list";
import interactionPlugin from "@fullcalendar/react/interaction";
import classicTheme from "@fullcalendar/react/themes/classic";
import thLocale from "@fullcalendar/react/locales/th";
import zhLocale from "@fullcalendar/react/locales/zh-cn";
import enLocale from "@fullcalendar/react/locales/en-gb";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import { Anchor, Boat, CaretLeft, CaretRight, ChatCircleText, CheckSquare, type Icon } from "@phosphor-icons/react";
import { Button, Segmented } from "antd";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../store";
import { useMedia } from "../../ui/useMedia";
import { AiBriefCard, PageHeader, Panel } from "../components";
import { useAppMode } from "../hooks/useAppMode.ts";
import { localizeDemo } from "../lib/demoText.ts";
import { useModeJobs } from "./home/attention.ts";
import "./home/home.css";

type Kind = "etd" | "eta" | "task" | "act";
type Ev = {
  id: string;
  title: string;
  date: string;
  url?: string;
  kind: Kind;
  color: string;
  textColor: string;
};

/** Each event type = one icon + one color, used on chips and in the legend. */
const LOOK: Record<Kind, { icon: Icon; label: string }> = {
  etd: { icon: Boat, label: "home_cal_k_etd" },
  eta: { icon: Anchor, label: "home_cal_k_eta" },
  task: { icon: CheckSquare, label: "home_cal_k_task" },
  act: { icon: ChatCircleText, label: "home_cal_k_act" },
};
const KINDS: Kind[] = ["etd", "eta", "task", "act"];
const SOFT: Record<Kind, [string, string]> = {
  etd: ["var(--info-soft)", "oklch(0.38 0.12 250)"],
  eta: ["var(--primary-soft)", "var(--primary-deep)"],
  task: ["var(--warning-soft)", "var(--warning-text)"],
  act: ["var(--fill)", "var(--ink-soft)"],
};
const cls = (k: Kind) => ({ color: SOFT[k][0], textColor: SOFT[k][1] });

const INTL = { th: "th-TH-u-ca-gregory", zh: "zh-CN", en: "en-GB" } as const;
const FC_LOCALE = { th: thLocale, zh: zhLocale, en: enLocale } as const;

export function CalendarPageV2() {
  const { tx, tasks, activities, locale } = useStore();
  const { enabled } = useAppMode();
  const { jobs } = useModeJobs();
  const navigate = useNavigate();
  const narrow = useMedia("(max-width: 640px)");
  const ref = useRef<CalendarRef>(null);
  const [title, setTitle] = useState("");
  const [view, setView] = useState<"dayGridMonth" | "listWeek">(() =>
    narrow ? "listWeek" : "dayGridMonth",
  );
  const [kind, setKind] = useState<"all" | Kind>("all");

  const events = useMemo(() => {
    const list: Ev[] = [];
    for (const j of jobs) {
      if (j.etd && j.etd !== "—")
        list.push({
          id: `etd-${j.id}`,
          kind: "etd",
          title: j.jobNumber,
          date: normalizeDate(j.etd),
          url: `/jobs/${j.id}`,
          ...cls("etd"),
        });
      if (j.eta && j.eta !== "—")
        list.push({
          id: `eta-${j.id}`,
          kind: "eta",
          title: j.jobNumber,
          date: normalizeDate(j.eta),
          url: `/jobs/${j.id}`,
          ...cls("eta"),
        });
    }
    for (const t of tasks) {
      if (t.due && !t.done)
        list.push({
          id: `task-${t.id}`,
          kind: "task",
          title: localizeDemo(t.title, locale),
          date: normalizeDate(t.due),
          url: "/tasks",
          ...cls("task"),
        });
    }
    for (const a of activities) {
      if (a.at)
        list.push({
          id: `act-${a.id}`,
          kind: "act",
          title: localizeDemo(a.body, locale).slice(0, 40),
          date: normalizeDate(a.at),
          url: a.customerId ? `/customers/${a.customerId}` : undefined,
          ...cls("act"),
        });
    }
    return list;
  }, [activities, jobs, tasks, locale]);

  const count = (k: Kind) => events.filter((e) => e.kind === k).length;
  const shown = kind === "all" ? events : events.filter((e) => e.kind === kind);

  const facts = useMemo(
    () => ({
      events: events.length,
      departures: count("etd"),
      arrivals: count("eta"),
      tasksDue: count("task"),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events],
  );
  const localBrief = `${facts.departures} departures, ${facts.arrivals} arrivals and ${facts.tasksDue} tasks on the calendar.`;

  const api = () => ref.current?.getApi();

  if (!enabled) {
    return (
      <PageHeader
        title={tx("calendarTitle")}
        subtitle={tx("home_not_connected")}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={tx("home_cal_title")}
        subtitle={tx("home_cal_sub")}
        extra={
          <AiBriefCard
            title={tx("home_ai_cal_title")}
            facts={facts}
            localFallback={localBrief}
            context="calendar"
          />
        }
      >
        <div className="hm-cal-legend" role="group" aria-label={tx("home_cal_legend")}>
          {KINDS.map((k) => {
            const L = LOOK[k];
            const on = kind === "all" || kind === k;
            return (
              <button
                key={k}
                type="button"
                className={`hm-legend-btn is-${k}${on ? "" : " is-off"}`}
                aria-pressed={kind === k}
                onClick={() => setKind(kind === k ? "all" : k)}
              >
                <span className="hm-ev-icon">
                  <L.icon size={14} weight="fill" aria-hidden />
                </span>
                <span>{tx(L.label)}</span>
                <strong>{count(k)}</strong>
              </button>
            );
          })}
        </div>
      </PageHeader>

      <Panel className="hm-cal" flush>
        <div className="hm-cal-bar">
          <div className="hm-cal-nav">
            <Button
              icon={<CaretLeft size={16} />}
              aria-label={tx("home_cal_prev")}
              onClick={() => api()?.prev()}
            />
            <Button
              icon={<CaretRight size={16} />}
              aria-label={tx("home_cal_next")}
              onClick={() => api()?.next()}
            />
            <Button onClick={() => api()?.today()}>{tx("home_today")}</Button>
          </div>
          <h2 className="hm-cal-title">{title}</h2>
          <Segmented
            value={view}
            onChange={(v) => {
              const next = v as typeof view;
              setView(next);
              api()?.changeView(next);
            }}
            options={[
              { value: "dayGridMonth", label: tx("home_cal_month") },
              { value: "listWeek", label: tx("home_cal_list") },
            ]}
          />
        </div>
        <div className="hm-cal-body">
          <FullCalendar
            ref={ref}
            plugins={[
              classicTheme,
              dayGridPlugin,
              listPlugin,
              interactionPlugin,
            ]}
            locale={FC_LOCALE[locale as keyof typeof FC_LOCALE] ?? enLocale}
            initialView={view}
            headerToolbar={false}
            height="auto"
            dayMaxEvents={3}
            events={shown}
            eventDisplay="block"
            eventContent={(arg) => {
              const k = (arg.event.extendedProps as { kind?: Kind }).kind ?? "act";
              const L = LOOK[k] ?? LOOK.act;
              return (
                <span className={`hm-ev-inner is-${k}`} title={`${tx(L.label)} · ${arg.event.title}`}>
                  <span className="hm-ev-icon">
                    <L.icon size={12} weight="fill" aria-hidden />
                  </span>
                  <span className="hm-ev-text">{arg.event.title}</span>
                </span>
              );
            }}
            datesSet={(info) => {
              // Own title so Thai shows the Gregorian year like the rest of the app.
              const loc = INTL[locale as keyof typeof INTL] ?? "en-GB";
              const start = new Date(info.start.valueOf());
              const end = new Date(info.end.valueOf() - 1);
              if (info.view.type.startsWith("list")) {
                const f = new Intl.DateTimeFormat(loc, {
                  day: "numeric",
                  month: "short",
                });
                setTitle(`${f.format(start)} – ${f.format(end)}`);
              } else {
                const mid = new Date((start.getTime() + end.getTime()) / 2);
                setTitle(
                  new Intl.DateTimeFormat(loc, {
                    month: "long",
                    year: "numeric",
                  }).format(mid),
                );
              }
            }}
            eventClick={(info) => {
              if (info.event.url) {
                info.jsEvent.preventDefault();
                navigate(info.event.url);
              }
            }}
          />
        </div>
      </Panel>
    </>
  );
}

/** Accept MM-DD, "MM-DD HH:mm" or YYYY-MM-DD for the calendar feed. */
function normalizeDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const year = new Date().getFullYear();
  const md = /^(\d{2}-\d{2})/.exec(raw);
  if (md) return `${year}-${md[1]}`;
  return raw;
}
