import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { customerName, type Customer } from "../data";
import { useContainers } from "../hooks/useContainers";
import { canEditLogistics } from "../shell/nav.ts";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useShellOps, YARD_SLOTS, type YardSlot } from "../shell/opsStore.tsx";
import { useIsShellMode, useShellSession } from "../shell/session.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

function slotFromYard(yard: string) {
  const m = yard.match(/\b([ABC][1-4])\b/i);
  return m ? m[1].toUpperCase() : null;
}

export function YardPage() {
  const shell = useIsShellMode();
  const { shellUser } = useShellSession();
  const store = useStore();
  const crm = useShellCrm();
  const ops = useShellOps();
  const containers = useContainers({ yardOnly: true });
  const { tx, locale } = store;

  if (shell && shellUser && !canEditLogistics(shellUser.department) && shellUser.department === "sales") {
    return <Navigate to="/boxes" replace />;
  }
  if (shell && shellUser?.department === "finance") {
    return <Navigate to="/invoices" replace />;
  }

  const customers = shell ? crm.customers : store.customers;
  const boxes = shell ? ops.boxes.filter((b) => b.status === "yard" || b.status === "empty" || b.status === "hold") : containers.boxes;
  const canEdit = shell ? canEditLogistics(shellUser?.department ?? null) : true;
  const [picked, setPicked] = useState<string | null>(null);
  const moveBox = shell ? ops.moveBox : containers.moveBox;
  const err = shell ? null : containers.err;

  const map = useMemo(() => {
    const placed = new Map<string, (typeof boxes)[number]>();
    const leftovers: typeof boxes = [];
    for (const b of boxes) {
      const slot = slotFromYard(b.yardZh) ?? slotFromYard(("yardEn" in b ? b.yardEn : "") as string);
      if (slot && YARD_SLOTS.includes(slot as YardSlot) && !placed.has(slot)) placed.set(slot, b);
      else leftovers.push(b);
    }
    for (const slot of YARD_SLOTS) {
      if (placed.has(slot)) continue;
      const next = leftovers.shift();
      if (next) placed.set(slot, next);
    }
    return placed;
  }, [boxes]);

  function onSlot(slot: string) {
    if (!canEdit) return;
    const box = map.get(slot);
    if (picked && !box) {
      void moveBox(picked, slot as YardSlot);
      setPicked(null);
      return;
    }
    if (box) setPicked(picked === box.id ? null : box.id);
  }

  const teu = boxes.reduce((n, b) => n + b.teu, 0);
  const filled = map.size;

  return (
    <div className="page page--workspace page--yard">
      <PageToolbar
        title={tx("yardTitle")}
        count={boxes.length}
        hint={shell ? `${tx("shellDataBadge")} · ${picked ? tx("move") : tx("yardHint")}` : picked ? tx("move") : tx("yardHint")}
        actions={
          picked ? (
            <button type="button" className="btn btn-ghost" onClick={() => setPicked(null)}>
              {tx("cancel")}
            </button>
          ) : null
        }
      />

      {err ? <p className="meta form-err">{err}</p> : null}

      <div className="stat-strip">
        <span className="stat-chip stat-chip--metric">
          <strong className="num">{teu}</strong>
          <span>{tx("teuInYard")}</span>
        </span>
        <span className="stat-chip">
          <strong>{filled}</strong> / {YARD_SLOTS.length} slots
        </span>
        {picked ? (
          <span className="stat-chip stat-chip--active">
            {tx("move")}: <strong className="mono">{picked}</strong>
          </span>
        ) : null}
      </div>

      <div className="yard-grid" role="list">
        {YARD_SLOTS.map((slot) => {
          const box = map.get(slot);
          const c = box ? customers.find((x) => x.id === box.customerId) : null;
          return (
            <button
              key={slot}
              type="button"
              role="listitem"
              className={`yard-slot${box ? " is-filled" : ""}${picked === box?.id ? " is-picked" : ""}${picked && !box ? " is-drop" : ""}`}
              onClick={() => onSlot(slot)}
              disabled={!canEdit && !box}
            >
              <span className="yard-slot-id">{slot}</span>
              {box ? (
                <>
                  <strong className="mono">{box.id}</strong>
                  <span className="meta">{c ? customerName(c as Customer, locale) : box.customerId}</span>
                  <span className="num">{box.teu} TEU</span>
                </>
              ) : (
                <span className="meta">—</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
