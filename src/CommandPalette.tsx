import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Boat, MagnifyingGlass, ShippingContainer } from "@phosphor-icons/react";
import { useStore } from "./store";
import { v2NavGroups } from "./v2/navConfig.ts";
import { useCustomerLookup } from "./v2/hooks/useCustomerLookup.ts";
import { Flag } from "./v2/components/Graphics.tsx";
import "./v2/pages/public.css";

type Hit = { to: string; label: string; sub?: string; icon: ReactNode; tone?: string; trail?: ReactNode };

/** Tiny route: origin flag → destination flag. */
function FlagRoute({ from, to }: { from?: string; to?: string }) {
  if (!from && !to) return null;
  return (
    <span className="pub-cmd-route" aria-label={`${from ?? "—"} → ${to ?? "—"}`}>
      <Flag code={from} size={16} />
      <ArrowRight size={12} aria-hidden />
      <Flag code={to} size={16} />
    </span>
  );
}

function initialOf(name: string) {
  return Array.from(name.replace(/^(บริษัท|บจก\.?|หจก\.?)\s*/, "").trim())[0]?.toUpperCase() ?? "?";
}
type Group = { key: string; title: string; hits: Hit[] };

const pages = v2NavGroups.flatMap((g) => g.items.filter((i) => !i.yardModule));

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tx, query, setQuery, boxes, shipments } = useStore();
  const { customers, nameOf } = useCustomerLookup();
  const navigate = useNavigate();
  const [q, setQ] = useState(query);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const nq = q.trim().toLowerCase();

  useEffect(() => {
    if (open) {
      setQ(query);
      setActive(0);
    }
  }, [open, query]);

  const groups = useMemo<Group[]>(() => {
    const pageHits: Hit[] = pages
      .filter((p) => !nq || tx(p.labelKey).toLowerCase().includes(nq) || p.path.includes(nq))
      .map((p) => {
        const Icon = p.icon;
        return { to: p.path, label: tx(p.labelKey), icon: <Icon size={18} weight="duotone" aria-hidden />, tone: "is-primary" };
      });
    if (!nq) return [{ key: "pages", title: tx("pub_cmd_group_pages"), hits: pageHits.slice(0, 8) }];

    const custHits: Hit[] = customers
      .filter((c) => {
        const loose = c as typeof c & { name?: string };
        return `${c.nameZh ?? ""}${c.nameTh ?? ""}${c.nameEn ?? ""}${loose.name ?? ""}`.toLowerCase().includes(nq);
      })
      .slice(0, 5)
      .map((c) => {
        const name = nameOf(c.id);
        return { to: `/customers/${c.id}`, label: name, icon: <span className="pub-cmd-initial">{initialOf(name)}</span>, tone: "is-info" };
      });
    const boxHits: Hit[] = boxes
      .filter((b) => b.id.toLowerCase().includes(nq) || b.bl.toLowerCase().includes(nq))
      .slice(0, 5)
      .map((b) => ({
        to: `/boxes?q=${b.id}`,
        label: b.id,
        sub: b.bl,
        icon: <ShippingContainer size={18} weight="duotone" aria-hidden />,
        tone: "is-accent",
        trail: <FlagRoute from={b.pol} to={b.pod} />,
      }));
    const shipHits: Hit[] = shipments
      .filter((sh) => `${sh.bookingNo} ${sh.bl} ${sh.vessel}`.toLowerCase().includes(nq))
      .slice(0, 5)
      .map((sh) => ({
        to: "/shipments",
        label: sh.bookingNo,
        sub: sh.vessel,
        icon: <Boat size={18} weight="duotone" aria-hidden />,
        tone: "is-primary",
        trail: <FlagRoute from={sh.pol} to={sh.pod} />,
      }));

    return [
      { key: "customers", title: tx("pub_cmd_group_customers"), hits: custHits },
      { key: "boxes", title: tx("pub_cmd_group_boxes"), hits: boxHits },
      { key: "bookings", title: tx("pub_cmd_group_bookings"), hits: shipHits },
      { key: "pages", title: tx("pub_cmd_group_pages"), hits: pageHits.slice(0, 6) },
    ].filter((g) => g.hits.length > 0);
  }, [boxes, customers, nameOf, nq, shipments, tx]);

  const flat = useMemo(() => groups.flatMap((g) => g.hits), [groups]);
  const current = Math.min(active, Math.max(flat.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  if (!open) return null;

  function go(hit: Hit | undefined) {
    if (!hit) return;
    navigate(hit.to);
    onClose();
  }

  let idx = -1;

  return (
    <div className="pub-cmd-layer">
      <button type="button" className="pub-cmd-back" aria-label={tx("pub_cmd_close")} onClick={onClose} />
      <div className="pub-cmd" role="dialog" aria-modal="true" aria-label={tx("pub_cmd_label")}>
        <div className="pub-cmd-search">
          <MagnifyingGlass size={22} aria-hidden />
          <input
            autoFocus
            className="pub-cmd-input"
            value={q}
            role="combobox"
            aria-expanded="true"
            aria-controls="pub-cmd-list"
            aria-activedescendant={flat.length ? `pub-cmd-opt-${current}` : undefined}
            aria-label={tx("pub_cmd_label")}
            onChange={(e) => {
              setQ(e.target.value);
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder={tx("pub_cmd_placeholder")}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((current + 1) % Math.max(flat.length, 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((current - 1 + flat.length) % Math.max(flat.length, 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(flat[current]);
              }
            }}
          />
          <kbd className="pub-kbd">Esc</kbd>
        </div>

        <div className="pub-cmd-list" id="pub-cmd-list" role="listbox" ref={listRef}>
          {flat.length === 0 ? (
            <p className="pub-cmd-empty">{tx("pub_cmd_empty", { q: q.trim() })}</p>
          ) : (
            groups.map((g) => (
              <div key={g.key} className="pub-cmd-group" role="group" aria-label={g.title}>
                <div className="pub-cmd-group-title" aria-hidden>
                  {g.title}
                </div>
                {g.hits.map((h) => {
                  idx += 1;
                  const i = idx;
                  return (
                    <button
                      key={h.to + h.label}
                      id={`pub-cmd-opt-${i}`}
                      data-idx={i}
                      type="button"
                      role="option"
                      aria-selected={i === current}
                      tabIndex={-1}
                      className={i === current ? "pub-cmd-item is-active" : "pub-cmd-item"}
                      onMouseMove={() => i !== current && setActive(i)}
                      onClick={() => go(h)}
                    >
                      <span className={`pub-cmd-media ${h.tone ?? "is-neutral"}`}>{h.icon}</span>
                      <span className="pub-cmd-item-text">{h.label}</span>
                      {h.sub ? <span className="pub-cmd-item-sub cz-mono">{h.sub}</span> : null}
                      {h.trail}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="pub-cmd-foot" aria-hidden>
          <span>
            <kbd className="pub-kbd">↑</kbd>
            <kbd className="pub-kbd">↓</kbd>
            {tx("pub_cmd_move")}
          </span>
          <span>
            <kbd className="pub-kbd">↵</kbd>
            {tx("pub_cmd_open")}
          </span>
          <span>
            <kbd className="pub-kbd">Esc</kbd>
            {tx("pub_cmd_close")}
          </span>
        </div>
      </div>
    </div>
  );
}
