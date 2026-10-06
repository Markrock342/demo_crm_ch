import { ChatCircleText } from "@phosphor-icons/react";
import { Tooltip } from "antd";
import { useState } from "react";
import type { UnitColor } from "../../../api/businessUnits.ts";
import { PersonAvatar } from "../../components";
import { unitTone } from "../../lib/unitLook.ts";
import "./cases.css";

/** Business unit (ธุรกิจในเครือ) as a colored dot + name pill. */
export function UnitChip({ unit, size }: { unit: { name: string; color: UnitColor | null }; size?: "sm" }) {
  return (
    <span className={`cs-unit is-${unitTone(unit.color)}${size === "sm" ? " is-sm" : ""}`}>
      <span className="cs-unit-dot" aria-hidden />
      <span className="cs-unit-name">{unit.name}</span>
    </span>
  );
}

/** Green LINE chat mark; with `label` it becomes a small pill (e.g. the OA name). */
export function LineBadge({ label, title, size = 14 }: { label?: string; title?: string; size?: number }) {
  const mark = (
    <span className={`cs-line-badge${label ? " has-label" : ""}`} role="img" aria-label={title ?? label ?? "LINE"}>
      <ChatCircleText size={size} weight="fill" aria-hidden />
      {label ? <span>{label}</span> : null}
    </span>
  );
  return title ? <Tooltip title={title}>{mark}</Tooltip> : mark;
}

/** The customer's LINE profile picture (falls back to initials) with a small LINE mark. */
export function LineAvatar({ name, pictureUrl, size = 24, mark = true }: { name: string; pictureUrl?: string | null; size?: number; mark?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="cs-line-avatar" style={{ width: size, height: size }}>
      {pictureUrl && !broken ? (
        <img src={pictureUrl} alt={name} width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        <PersonAvatar name={name} size={size} />
      )}
      {mark ? (
        <span className="cs-line-avatar-mark" aria-hidden>
          <ChatCircleText size={Math.max(9, Math.round(size * 0.42))} weight="fill" />
        </span>
      ) : null}
    </span>
  );
}
