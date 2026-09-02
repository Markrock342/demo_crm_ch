import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { customerName } from "../data";
import { useStore } from "../store";

function weekWindow(from = new Date()) {
  const start = new Date(from);
  const dow = start.getDay();
  start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const today = `${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;
  return { days, today };
}

export function CalendarPage() {
  const { tx, locale, tasks, activities, customers, shipments } = useStore();
  const navigate = useNavigate();
  const { days, today } = useMemo(() => weekWindow(), []);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{tx("calendarTitle")}</h1>
          <p>{tx("calendarHint")}</p>
        </div>
      </div>
      <div className="cal" role="list">
        {days.map((day) => {
          const sailToday = shipments.filter((s) => s.etd === day || s.eta === day);
          const items = [
            ...tasks.filter((t) => t.due.startsWith(day)).map((t) => ({
              id: t.id,
              kind: tx("activityTask"),
              body: t.title,
              customerId: t.customerId,
              extra: t.owner,
              link: t.boxId ? `/boxes?q=${t.boxId}` : t.customerId ? `/customers/${t.customerId}` : "/tasks",
            })),
            ...activities
              .filter((a) => a.at.startsWith(day))
              .map((a) => ({
                id: a.id,
                kind: tx(activityI18nKey(a.type)),
                body: a.body,
                customerId: a.customerId,
                extra: a.user,
                link: a.customerId ? `/customers/${a.customerId}` : undefined,
              })),
            ...sailToday.map((s) => ({
              id: s.id,
              kind: s.etd === day ? tx("calEtd") : tx("calEta"),
              body: `${s.vessel} · ${s.bookingNo}`,
              customerId: s.customerId,
              extra: `${s.pol}→${s.pod}`,
              link: `/boxes?q=${s.bl}`,
            })),
          ];
          return (
            <section key={day} className={`cal-day ${day === today ? "cal-today" : ""}`} aria-label={day}>
              <h2>
                {day}
                {day === today ? <span> · {tx("thisWeek")}</span> : null}
              </h2>
              {items.length === 0 ? <p className="empty-col">{tx("emptyCal")}</p> : null}
              {items.map((it) => {
                const c = it.customerId ? customers.find((x) => x.id === it.customerId) : undefined;
                return (
                  <button
                    key={it.id}
                    type="button"
                    className="cal-item"
                    onClick={() => it.link && navigate(it.link)}
                  >
                    <span className="cal-kind">{it.kind}</span>
                    <strong>{it.body}</strong>
                    <span>
                      {c ? customerName(c, locale) : "—"} · {it.extra}
                    </span>
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function activityI18nKey(type: string) {
  const map: Record<string, string> = { note: "activityNote", call: "activityCall", meet: "activityMeet", mail: "activityMail", task: "activityTask" };
  return map[type] ?? "activityNote";
}
