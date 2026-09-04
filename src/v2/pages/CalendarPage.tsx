import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import { Card, Col, Row } from "antd";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useShellJobs } from "../../shell/jobStore.tsx";
import { useStore } from "../../store";
import { PageHeader } from "../components/PageHeader.tsx";
import { AiBriefCard } from "../components/AiBriefCard.tsx";
import { useAppMode } from "../hooks/useAppMode.ts";
import { useLiveJobsList } from "../hooks/useJobs.ts";

export function CalendarPageV2() {
  const { tx, tasks, activities } = useStore();
  const { shell, enabled } = useAppMode();
  const jobsShell = useShellJobs();
  const liveJobs = useLiveJobsList();
  const jobs = shell ? jobsShell.jobs : (liveJobs.data ?? []);

  const events = useMemo(() => {
    const list: { id: string; title: string; date: string; url?: string; color?: string }[] = [];
    for (const j of jobs) {
      if (j.etd && j.etd !== "—") {
        list.push({ id: `etd-${j.id}`, title: `ETD ${j.jobNumber}`, date: normalizeDate(j.etd), url: `/jobs/${j.id}`, color: "#1e4d8c" });
      }
      if (j.eta && j.eta !== "—") {
        list.push({ id: `eta-${j.id}`, title: `ETA ${j.jobNumber}`, date: normalizeDate(j.eta), url: `/jobs/${j.id}`, color: "#237804" });
      }
    }
    for (const t of tasks) {
      if (t.due) list.push({ id: `task-${t.id}`, title: t.title, date: normalizeDate(t.due), url: t.customerId ? `/customers/${t.customerId}` : "/tasks", color: "#d48806" });
    }
    for (const a of activities) {
      if (a.at) list.push({ id: `act-${a.id}`, title: a.body.slice(0, 40), date: normalizeDate(a.at), color: "#888" });
    }
    return list;
  }, [activities, jobs, tasks]);

  const calFacts = {
    events: events.length,
    etd: events.filter((e) => e.title.startsWith("ETD")).length,
    eta: events.filter((e) => e.title.startsWith("ETA")).length,
    tasks: events.filter((e) => e.id.startsWith("task-")).length,
  };
  const calLocal = `Schedule: ${events.length} calendar events — ${calFacts.etd} departures, ${calFacts.eta} arrivals, ${calFacts.tasks} tasks due.`;

  if (!enabled) {
    return (
      <div style={{ padding: 24 }}>
        <PageHeader title={tx("calendarTitle")} subtitle={tx("apiNotConfigured")} />
        <Link to="/login">{tx("loginPickDept")}</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 8px 24px" }}>
      <PageHeader title={tx("calendarTitle")} subtitle={`${events.length} events · FullCalendar`} />
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <AiBriefCard title={tx("aiJobSummary")} facts={calFacts} localFallback={calLocal} compact />
        </Col>
      </Row>
      <Card size="small">
        <FullCalendar
          plugins={[dayGridPlugin, listPlugin, interactionPlugin] as never[]}
          initialView="dayGridMonth"
          headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,listWeek" }}
          height="auto"
          events={events}
          eventClick={(info) => {
            if (info.event.url) {
              info.jsEvent.preventDefault();
              window.location.href = info.event.url;
            }
          }}
        />
      </Card>
    </div>
  );
}

/** Accept MM-DD or YYYY-MM-DD for calendar feed. */
function normalizeDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const year = new Date().getFullYear();
  if (/^\d{2}-\d{2}$/.test(raw)) return `${year}-${raw}`;
  return raw;
}
