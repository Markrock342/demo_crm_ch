import type { UnitColor } from "../../api/businessUnits.ts";
import type { Tone } from "../components/Graphics.tsx";

/**
 * Business unit (ธุรกิจในเครือ) colors → design tones (classes `is-<tone>` from graphics.css).
 * Shared by UnitChip, the unit picker and the settings swatches.
 * The API keeps six names; the UI has no purple and keeps red for "late", so violet shows green and rose shows orange.
 */
export const UNIT_TONE: Record<UnitColor, Tone> = {
  teal: "primary",
  blue: "info",
  amber: "warning",
  violet: "success",
  rose: "accent",
  slate: "neutral",
};

export const unitTone = (color: UnitColor | null | undefined): Tone => (color ? UNIT_TONE[color] : "neutral");
