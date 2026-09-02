import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { customerName } from "./data";
import { useStore } from "./store";

const pages = [
  { to: "/", key: "navOverview" },
  { to: "/pipeline", key: "navPipeline" },
  { to: "/leads", key: "navLeads" },
  { to: "/customers", key: "navCustomers" },
  { to: "/contacts", key: "navContacts" },
  { to: "/boxes", key: "navBoxes" },
  { to: "/inbox", key: "navInbox" },
  { to: "/docs", key: "navDocs" },
  { to: "/tasks", key: "navTasks" },
  { to: "/calendar", key: "navCalendar" },
  { to: "/reports", key: "navReports" },
  { to: "/settings", key: "navSettings" },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tx, query, setQuery, customers, boxes, locale } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState(query);
  const nq = q.trim().toLowerCase();

  useEffect(() => {
    if (open) setQ(query);
  }, [open, query]);

  const hits = useMemo(() => {
    const acc = customers
      .filter((c) => `${c.nameZh}${c.nameTh}${c.nameEn}`.toLowerCase().includes(nq))
      .slice(0, 6)
      .map((c) => ({ to: `/customers/${c.id}`, label: customerName(c, locale) }));
    const box = boxes
      .filter((b) => b.id.toLowerCase().includes(nq) || b.bl.toLowerCase().includes(nq))
      .slice(0, 6)
      .map((b) => ({ to: `/boxes?q=${b.id}`, label: b.id }));
    const pg = pages
      .filter((p) => tx(p.key).toLowerCase().includes(nq) || p.to.includes(nq))
      .map((p) => ({ to: p.to, label: tx(p.key) }));
    if (!nq) return pg;
    return [...acc, ...box, ...pg].slice(0, 12);
  }, [boxes, customers, locale, nq, tx]);

  if (!open) return null;

  return (
    <div className="cmd-back" onClick={onClose} role="presentation">
      <div
        className="cmd"
        role="dialog"
        aria-label={tx("cmdHint")}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          className="cmd-input"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setQuery(e.target.value);
          }}
          placeholder={tx("cmdHint")}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && hits[0]) {
              navigate(hits[0].to);
              onClose();
            }
          }}
        />
        <ul className="cmd-list">
          {hits.map((h) => (
            <li key={h.to + h.label}>
              <button
                type="button"
                onClick={() => {
                  navigate(h.to);
                  onClose();
                }}
              >
                {h.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
