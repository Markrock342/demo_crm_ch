/* Business unit pickers + chip lists. The single chip itself is the cases kit's UnitChip (pages/cases/UnitChip.tsx). */
import { Check } from "@phosphor-icons/react";
import type { BusinessUnit, UnitColor } from "../../api/businessUnits.ts";
import { UNIT_COLORS } from "../../api/businessUnits.ts";
import { UnitChip } from "../pages/cases/UnitChip.tsx";
import { UNIT_TONE, unitTone } from "../lib/unitLook.ts";
import "./graphics.css";
import "./units.css";

/** Chips for a list of unit ids (unknown ids are skipped). */
export function UnitChips({ ids, byId, size, max = 3 }: { ids: readonly string[] | null | undefined; byId: Map<string, BusinessUnit>; size?: "sm"; max?: number }) {
  const list = (ids ?? []).map((id) => byId.get(id)).filter((u): u is BusinessUnit => Boolean(u));
  if (!list.length) return null;
  const shown = list.slice(0, max);
  const more = list.length - shown.length;
  return (
    <span className="cz-unit-chips">
      {shown.map((u) => (
        <UnitChip key={u.id} unit={u} size={size} />
      ))}
      {more > 0 ? (
        <span className="cz-unit-more" title={list.slice(max).map((u) => u.name).join(", ")}>
          +{more}
        </span>
      ) : null}
    </span>
  );
}

/** Six round swatches (radio group). */
export function UnitSwatches({
  value,
  onChange,
  label,
  colorLabel,
}: {
  value: UnitColor | null | undefined;
  onChange: (c: UnitColor) => void;
  label: string;
  colorLabel: (c: UnitColor) => string;
}) {
  return (
    <span className="cz-unit-swatches" role="radiogroup" aria-label={label}>
      {UNIT_COLORS.map((c) => {
        const on = value === c;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={colorLabel(c)}
            title={colorLabel(c)}
            className={`cz-unit-swatch is-${UNIT_TONE[c]}${on ? " is-on" : ""}`}
            onClick={() => onChange(c)}
          >
            {on ? <Check size={12} weight="bold" aria-hidden /> : null}
          </button>
        );
      })}
    </span>
  );
}

/** Multi-select of units as toggle chips (customer form). */
export function UnitPicker({
  value = [],
  onChange,
  units,
  label,
}: {
  value?: string[];
  onChange?: (v: string[]) => void;
  units: BusinessUnit[];
  label: string;
}) {
  const toggle = (id: string) => onChange?.(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="cz-unit-picker" role="group" aria-label={label}>
      {units.map((u) => {
        const on = value.includes(u.id);
        return (
          <button
            key={u.id}
            type="button"
            aria-pressed={on}
            className={`cz-unit-toggle is-${unitTone(u.color)}${on ? " is-on" : ""}`}
            onClick={() => toggle(u.id)}
          >
            <i aria-hidden>{on ? <Check size={10} weight="bold" /> : null}</i>
            {u.name}
          </button>
        );
      })}
    </div>
  );
}
