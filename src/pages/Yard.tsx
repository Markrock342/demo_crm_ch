import { ArrowsOutCardinal, Buildings, CalendarBlank, DownloadSimple, FileText, ListBullets, MapPin, Package, SquareSplitHorizontal, Stamp, Timer, Truck, X } from "@phosphor-icons/react";
import { Button, Tooltip } from "antd";
import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useContainers } from "../hooks/useContainers";
import { canEditLogistics } from "../shell/nav.ts";
import { useShellOps, YARD_SLOTS, type YardSlot } from "../shell/opsStore.tsx";
import { useIsShellMode, useShellSession } from "../shell/session.tsx";
import { useStore } from "../store";
import { Donut, PageHeader, Panel, StatusTag, Tile, TileRow } from "../v2/components";
import type { Tone } from "../v2/components/Graphics.tsx";
import { BoxPortrait, BoxRoof, daysInYard, FREE_DAYS, FreeTimeBar, freeTimeOf, isLongBox } from "../v2/pages/ops/BoxVisuals.tsx";
import { useCustomerName } from "../v2/pages/ops/opsHooks.ts";
import { boxMeta, boxStatusLabel, fmtOpsDate } from "../v2/pages/ops/opsShared.ts";
import { placeName } from "../v2/lib/places.ts";
import "../v2/pages/ops/ops.css";

function slotFromYard(yard: string) {
  const m = yard.match(/\b([ABC][1-4])\b/i);
  return m ? m[1].toUpperCase() : null;
}

type YardBox = {
  id: string;
  customerId: string;
  yardZh: string;
  teu: number;
  yardEn?: string;
  type: string;
  status: string;
  bl: string;
  eta: string;
  direction?: string;
  lastFreeDay?: string;
};

const ROWS = ["A", "B", "C"] as const;
const COLS = [1, 2, 3, 4] as const;

function slotKind(box: YardBox | undefined): "empty" | "hold" | "emptybox" | "laden" {
  if (!box) return "empty";
  if (box.status === "hold" || box.status === "customs") return "hold";
  if (box.status === "empty" || box.status === "empty_returned" || box.status === "empty_pickup") return "emptybox";
  return "laden";
}

export function YardPage() {
  const shell = useIsShellMode();
  const { shellUser } = useShellSession();
  const store = useStore();
  const ops = useShellOps();
  const containers = useContainers({ yardOnly: true });
  const { tx, locale } = store;
  const customerNameOf = useCustomerName();
  const [picked, setPicked] = useState<string | null>(null);
  const [focusSlot, setFocusSlot] = useState<string | null>(null);

  const boxes = shell
    ? ops.boxes.filter((b) => b.status === "gate_in" || b.status === "empty_returned" || b.status === "stuffing" || b.status === "empty_pickup")
    : containers.boxes;
  const canEdit = shell ? canEditLogistics(shellUser?.department ?? null) : true;
  const moveBox = shell ? ops.moveBox : containers.moveBox;
  const err = shell ? null : containers.err;

  const { map, unplaced } = useMemo(() => {
    const placed = new Map<string, YardBox>();
    const leftovers: YardBox[] = [];
    for (const b of boxes) {
      const row: YardBox = {
        id: b.id,
        customerId: b.customerId,
        yardZh: b.yardZh,
        teu: b.teu,
        yardEn: "yardEn" in b ? b.yardEn : undefined,
        type: b.type,
        status: b.status,
        bl: b.bl,
        eta: b.eta,
        direction: b.dir,
        lastFreeDay: "lastFreeDay" in b ? (b.lastFreeDay as string | undefined) : undefined,
      };
      const slot = slotFromYard(row.yardZh) ?? slotFromYard(row.yardEn ?? "");
      if (slot && YARD_SLOTS.includes(slot as YardSlot) && !placed.has(slot)) placed.set(slot, row);
      else leftovers.push(row);
    }
    for (const slot of YARD_SLOTS) {
      if (placed.has(slot)) continue;
      const next = leftovers.shift();
      if (next) placed.set(slot, next);
    }
    return { map: placed, unplaced: leftovers };
  }, [boxes]);

  if (shell && shellUser && !canEditLogistics(shellUser.department) && shellUser.department === "sales") {
    return <Navigate to="/boxes" replace />;
  }
  if (shell && shellUser?.department === "finance") {
    return <Navigate to="/invoices" replace />;
  }

  function onSlot(slot: string) {
    const box = map.get(slot);
    if (!canEdit) {
      setFocusSlot(slot);
      return;
    }
    if (picked && !box) {
      void moveBox(picked, slot as YardSlot);
      setPicked(null);
      setFocusSlot(slot);
      return;
    }
    setFocusSlot(slot);
    if (box) setPicked(picked === box.id ? null : box.id);
  }

  const teu = boxes.reduce((n, b) => n + b.teu, 0);
  const filled = map.size;
  const holdCount = [...map.values()].filter((b) => slotKind(b) === "hold").length;
  const pickedBox = picked ? [...map.values()].find((b) => b.id === picked) : undefined;
  const focusBox = pickedBox ?? (focusSlot ? map.get(focusSlot) : undefined);
  const focusSlotOf = focusBox ? [...map.entries()].find(([, b]) => b.id === focusBox.id)?.[0] : focusSlot;

  const kindOf = (b: YardBox | undefined): Tone | null => {
    if (!b) return null;
    const ft = freeTimeOf(b);
    if (ft && ft.daysLeft < 0) return "danger";
    const k = slotKind(b);
    return k === "hold" ? "warning" : k === "emptybox" ? "neutral" : "primary";
  };
  const placedBoxes = [...map.values()];
  const tally = (t: Tone) => placedBoxes.filter((b) => kindOf(b) === t).length;
  const free = YARD_SLOTS.length - filled;
  const focusFree = focusBox ? freeTimeOf(focusBox) : null;
  const focusDays = focusBox ? daysInYard(focusBox) : null;
  const freeLabels = (n: number) => ({ left: tx("ops_bx_daysLeft", { n }), over: tx("ops_bx_daysOver", { n: -n }), last: tx("ops_bx_lastDay") });

  const legendItems: { tone: Tone | "free"; label: string }[] = [
    { tone: "primary", label: tx("ops_yard_lgLaden") },
    { tone: "neutral", label: tx("ops_yard_lgEmptyBox") },
    { tone: "warning", label: tx("ops_yard_lgHold") },
    { tone: "danger", label: tx("ops_bx_lgOverdue") },
    { tone: "free", label: tx("ops_yard_lgFree") },
  ];

  return (
    <div className="ops-page">
      <PageHeader
        title={tx("ops_yard_title")}
        subtitle={picked ? tx("ops_yard_subMoving", { id: picked }) : tx("ops_yard_statBoxes", { n: boxes.length }) + ` · ${teu} TEU`}
        extra={
          <>
            <Link to="/boxes?tab=yard">
              <Button icon={<ListBullets size={16} />}>{tx("ops_yard_list")}</Button>
            </Link>
            {picked ? (
              <Button icon={<X size={16} />} onClick={() => setPicked(null)}>
                {tx("ops_yard_cancelMove")}
              </Button>
            ) : null}
          </>
        }
      >
        <div className="yd-summary">
          <div className="yd-donut">
            <Donut
              size={96}
              center={`${filled}/${YARD_SLOTS.length}`}
              caption={tx("ops_bx_yUsed")}
              parts={[
                { value: tally("primary"), tone: "primary", label: tx("ops_yard_lgLaden") },
                { value: tally("neutral"), tone: "neutral", label: tx("ops_yard_lgEmptyBox") },
                { value: tally("warning"), tone: "warning", label: tx("ops_yard_lgHold") },
                { value: tally("danger"), tone: "danger", label: tx("ops_bx_lgOverdue") },
                { value: free, tone: "success", label: tx("ops_yard_lgFree") },
              ]}
            />
          </div>
          <TileRow>
            <Tile icon={Package} tone="primary" value={filled} label={tx("ops_bx_yOccupied")} />
            <Tile icon={SquareSplitHorizontal} tone={free ? "success" : "warning"} value={free} label={tx("ops_yard_statFree")} />
            <Tile icon={Stamp} tone={holdCount ? "warning" : "neutral"} value={holdCount} label={tx("ops_yard_statHold")} to="/boxes?tab=customs" />
          </TileRow>
        </div>
      </PageHeader>

      {err ? <p className="ops-callout is-danger">{err}</p> : null}

      <div className="yd-layout">
        <Panel>
          <div className="yd-map-head">
            {picked ? (
              <div className="yd-moving" role="status">
                <ArrowsOutCardinal size={18} weight="bold" aria-hidden />
                <span>{tx("ops_yard_pickHint")}</span>
              </div>
            ) : (
              <h2 className="yd-map-title">{tx("ops_yard_map")}</h2>
            )}
            <ul className="yd-legend" aria-label={tx("ops_yard_legend")}>
              {legendItems.map((l) => (
                <li key={l.label}>
                  <span className={`yd-sw ${l.tone === "free" ? "is-free" : `is-${l.tone}`}`} aria-hidden />
                  {l.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="yd-ground">
            <div className="yd-grid" role="grid" aria-label={tx("ops_yard_map")}>
              <span aria-hidden />
              {COLS.map((c) => (
                <span key={c} className="yd-axis" aria-hidden>
                  {c}
                </span>
              ))}
              {ROWS.map((r) => (
                <div key={r} role="row" style={{ display: "contents" }}>
                  <span className="yd-axis is-row" aria-hidden>
                    {r}
                  </span>
                  {COLS.map((c) => {
                    const slot = `${r}${c}`;
                    const box = map.get(slot);
                    const tone = kindOf(box);
                    const isPicked = Boolean(box && picked === box.id);
                    const isDrop = Boolean(picked && !box);
                    const days = box ? daysInYard(box) : null;
                    const long = box ? isLongBox(box.type) : true;
                    const btn = (
                      <button
                        key={slot}
                        type="button"
                        role="gridcell"
                        className={`yd-slot${box ? " is-filled" : ""}${isPicked ? " is-picked" : ""}${isDrop ? " is-drop" : ""}${focusSlotOf === slot ? " is-focus" : ""}`}
                        onClick={() => onSlot(slot)}
                        disabled={!canEdit && !box}
                        aria-pressed={isPicked}
                        aria-label={
                          box
                            ? `${slot} · ${box.id} · ${customerNameOf(box.customerId)}`
                            : isDrop
                              ? `${slot} · ${tx("ops_yard_dropHere")}`
                              : `${slot} · ${tx("ops_yard_lgFree")}`
                        }
                      >
                        <span className="yd-slot-id">{slot}</span>
                        {box && tone ? (
                          <span className={`yd-slot-art${long ? "" : " is-short-art"}`}>
                            <BoxRoof tone={tone} type={box.type} />
                            <span className="yd-slot-no cz-mono">
                              <span className="yd-slot-owner">{box.id.slice(0, 4)}</span>
                              {box.id.slice(4)}
                            </span>
                            {tone === "danger" || tone === "warning" ? (
                              <span className={`yd-slot-flag is-${tone}`} aria-hidden>
                                {tone === "danger" ? <Timer size={13} weight="fill" /> : <Stamp size={13} weight="fill" />}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="yd-slot-free">
                            {isDrop ? <DownloadSimple size={20} weight="bold" aria-hidden /> : null}
                            <span>{isDrop ? tx("ops_yard_dropHere") : tx("ops_bx_free")}</span>
                          </span>
                        )}
                      </button>
                    );
                    return box ? (
                      <Tooltip
                        key={slot}
                        mouseEnterDelay={0.15}
                        title={
                          <span className="yd-tip">
                            <strong>{box.id}</strong>
                            <span>{customerNameOf(box.customerId)}</span>
                            <span>
                              {box.type} · {boxStatusLabel(tx, box.status)}
                              {days !== null ? ` · ${tx("ops_bx_daysInYard", { n: days })}` : ""}
                            </span>
                          </span>
                        }
                      >
                        {btn}
                      </Tooltip>
                    ) : (
                      btn
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="yd-gate" aria-hidden>
              <Truck size={18} />
              <span className="yd-lane" />
              <span>{tx("ops_bx_gate")}</span>
            </div>
          </div>
        </Panel>

        <Panel title={focusSlotOf ? tx("ops_yard_slotTitle", { slot: focusSlotOf }) : tx("ops_yard_detail")}>
          {focusBox ? (
            <div className="yd-detail">
              <BoxPortrait no={focusBox.id} type={focusBox.type} tone={kindOf(focusBox) ?? "neutral"} />
              <div>
                <StatusTag status={focusBox.status} label={boxStatusLabel(tx, focusBox.status)} tone={boxMeta(focusBox.status).tone} />
              </div>
              {focusFree ? (
                <FreeTimeBar
                  daysLeft={focusFree.daysLeft}
                  labels={freeLabels(focusFree.daysLeft)}
                  hint={focusFree.estimated ? tx("ops_bx_freeEst", { n: FREE_DAYS }) : undefined}
                />
              ) : null}
              <ul className="yd-detail-facts">
                <li className="yd-fact">
                  <Buildings size={18} aria-label={tx("ops_col_customer")} />
                  <span>{customerNameOf(focusBox.customerId)}</span>
                </li>
                <li className="yd-fact">
                  <MapPin size={18} aria-label={tx("ops_col_location")} />
                  <span>{placeName(focusBox.yardZh, locale) || "—"}</span>
                </li>
                <li className="yd-fact">
                  <CalendarBlank size={18} aria-label="ETA" />
                  <span>
                    ETA {fmtOpsDate(focusBox.eta, locale)}
                    {focusDays !== null ? <span className="cz-muted"> · {tx("ops_bx_daysInYard", { n: focusDays })}</span> : null}
                  </span>
                </li>
                {focusBox.bl && focusBox.bl !== "—" ? (
                  <li className="yd-fact">
                    <FileText size={18} aria-label="B/L" />
                    <span className="cz-mono">{focusBox.bl}</span>
                  </li>
                ) : null}
              </ul>
              {canEdit ? (
                picked === focusBox.id ? (
                  <Button icon={<X size={16} />} onClick={() => setPicked(null)}>
                    {tx("ops_yard_cancelMove")}
                  </Button>
                ) : (
                  <Button type="primary" icon={<ArrowsOutCardinal size={16} />} onClick={() => setPicked(focusBox.id)}>
                    {tx("ops_yard_move")}
                  </Button>
                )
              ) : null}
              <Link to={`/boxes?q=${encodeURIComponent(focusBox.id)}`} className="ops-sub-link">
                {tx("ops_yard_openInList")}
              </Link>
            </div>
          ) : (
            <div className="yd-detail-empty">
              <BoxRoof tone="neutral" type="40HC" />
              <span>{focusSlotOf ? tx("ops_yard_slotFree", { slot: focusSlotOf }) : canEdit ? tx("ops_yard_detailHint") : tx("ops_yard_detailHintRead")}</span>
            </div>
          )}
          {unplaced.length ? (
            <div className="ops-unplaced-block">
              <h3 className="ops-drawer-h">{tx("ops_yard_unplaced", { n: unplaced.length })}</h3>
              <ul className="ops-unplaced">
                {unplaced.map((b) => (
                  <li key={b.id}>
                    <span className="cz-mono">{b.id}</span> <span className="cz-muted">· {customerNameOf(b.customerId)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
