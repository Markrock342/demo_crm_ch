import { ImageSquare } from "@phosphor-icons/react";
import type { BusinessUnit } from "../../../api/businessUnits.ts";
import { unitTone } from "../../lib/unitLook.ts";
import "./cases.css";
import { unitThumb } from "../../lib/photos.ts";

type Tx = (k: string, v?: Record<string, string | number>) => string;

/**
 * Business-unit filter as photo cards (photo + name + open cases). Click = filter (URL `unit`), click again = clear.
 * Scrolls sideways on phones.
 */
export function UnitPhotoRow({
  units,
  counts,
  value,
  onChange,
  tx,
}: {
  units: BusinessUnit[];
  counts: Record<string, number> | undefined;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  tx: Tx;
}) {
  const none = counts?.none ?? 0;
  const cards: { id: string; name: string; imageUrl: string | null; tone: string }[] = [
    ...units.map((u) => ({ id: u.id, name: u.name, imageUrl: u.imageUrl, tone: unitTone(u.color) })),
    ...(none > 0 || value === "none" ? [{ id: "none", name: tx("cs_unit_none"), imageUrl: null, tone: "neutral" }] : []),
  ];
  return (
    <div className={`cs-units${value ? " has-pick" : ""}`} role="group" aria-label={tx("cs_unit")}>
      {cards.map((u) => {
        const on = value === u.id;
        const n = counts?.[u.id] ?? 0;
        return (
          <button
            key={u.id}
            type="button"
            aria-pressed={on}
            className={`cs-unit-card is-${u.tone}${on ? " is-on" : ""}`}
            onClick={() => onChange(on ? undefined : u.id)}
          >
            <span className="cs-unit-card-photo">
              {u.imageUrl ? <img src={unitThumb(u.imageUrl)} alt="" width={64} height={48} loading="lazy" decoding="async" /> : <ImageSquare size={20} aria-hidden />}
            </span>
            <span className="cs-unit-card-text">
              <span className="cs-unit-card-name" title={u.name}>
                {u.name}
              </span>
              <span className="cs-unit-card-n" aria-label={`${tx("cs_tile_open")} ${n}`}>
                {n}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
