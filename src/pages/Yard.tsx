import { useMemo, useState } from "react";
import { customerName } from "../data";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

const SLOTS = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4", "C1", "C2", "C3", "C4"] as const;

function slotFromYard(yard: string) {
  const m = yard.match(/\b([ABC][1-4])\b/i);
  return m ? m[1].toUpperCase() : null;
}

export function YardPage() {
  const { tx, locale, boxes, customers, moveBox } = useStore();
  const onYard = boxes.filter((b) => b.status === "yard" || b.status === "empty" || b.status === "hold");
  const [picked, setPicked] = useState<string | null>(null);

  const map = useMemo(() => {
    const placed = new Map<string, (typeof onYard)[number]>();
    const leftovers: typeof onYard = [];
    for (const b of onYard) {
      const slot = slotFromYard(b.yardZh) ?? slotFromYard(b.yardEn);
      if (slot && SLOTS.includes(slot as (typeof SLOTS)[number]) && !placed.has(slot)) placed.set(slot, b);
      else leftovers.push(b);
    }
    for (const slot of SLOTS) {
      if (placed.has(slot)) continue;
      const next = leftovers.shift();
      if (next) placed.set(slot, next);
    }
    return placed;
  }, [onYard]);

  function onSlot(slot: string) {
    const box = map.get(slot);
    if (picked && !box) {
      moveBox(picked, `林查班 ${slot}`);
      setPicked(null);
      return;
    }
    if (box) setPicked(picked === box.id ? null : box.id);
  }

  const teu = onYard.reduce((n, b) => n + b.teu, 0);
  const filled = map.size;

  return (
    <div className="page page--workspace page--yard">
      <PageToolbar
        title={tx("yardTitle")}
        count={onYard.length}
        hint={picked ? tx("move") : tx("yardHint")}
        actions={
          picked ? (
            <button type="button" className="btn btn-ghost" onClick={() => setPicked(null)}>
              {tx("cancel")}
            </button>
          ) : null
        }
      />

      <div className="stat-strip">
        <span className="stat-chip stat-chip--metric">
          <strong className="num">{teu}</strong>
          <span>{tx("teuInYard")}</span>
        </span>
        <span className="stat-chip">
          <strong>{filled}</strong> / {SLOTS.length} slots
        </span>
        {picked ? (
          <span className="stat-chip stat-chip--active">
            {tx("move")}: <strong className="mono">{picked}</strong>
          </span>
        ) : null}
      </div>

      <div className="yard-grid" role="list">
        {SLOTS.map((slot) => {
          const box = map.get(slot);
          const c = box ? customers.find((x) => x.id === box.customerId) : null;
          return (
            <button
              key={slot}
              type="button"
              role="listitem"
              className={`slot ${box ? "slot-full" : "slot-empty"} ${picked === box?.id ? "slot-on" : ""} ${picked && !box ? "slot-target" : ""}`}
              onClick={() => onSlot(slot)}
            >
              <span className="slot-id">{slot}</span>
              {box ? (
                <>
                  <strong className="mono">{box.id}</strong>
                  <span className="cell-truncate">{c ? customerName(c, locale) : ""}</span>
                  <span className={`pill pill-${box.status}`}>{tx(`st${cap(box.status)}`)}</span>
                </>
              ) : (
                <span className="meta">{picked ? tx("move") : tx("emptySlot")}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
