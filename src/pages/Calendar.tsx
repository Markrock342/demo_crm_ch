import { useNavigate } from "react-router-dom";
import { activityI18n } from "../crm";
import { customerName } from "../data";
import { useStore } from "../store";

const days = ["09-01", "09-02", "09-03", "09-04", "09-05", "09-06", "09-07"];
const today = "09-02";

export function CalendarPage() {
  const { tx, locale, tasks, activities, customers } = useStore();
  const navigate = useNavigate();

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
          const items = [
            ...tasks.filter((t) => t.due.startsWith(day)).map((t) => ({
              id: t.id,
              kind: tx("activityTask"),
              body: t.title,
              customerId: t.customerId,
              extra: t.owner,
            })),
            ...activities
              .filter((a) => a.at.startsWith(day))
              .map((a) => ({
                id: a.id,
                kind: tx(activityI18n[a.type]),
                body: a.body,
                customerId: a.customerId,
                extra: a.user,
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
                    onClick={() => it.customerId && navigate(`/customers/${it.customerId}`)}
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
