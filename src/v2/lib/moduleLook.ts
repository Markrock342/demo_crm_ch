import type { Icon } from "@phosphor-icons/react";
import { Boat, FileText, Handshake, Headset, Invoice, Lightning, SquaresFour } from "@phosphor-icons/react";
import type { ModuleKey } from "../../api/modules.ts";
import type { GraphicTone } from "../components";

/** Picture + color for each company module (Settings › Modules, "not enabled" page). */
export const MODULE_LOOK: Record<ModuleKey, { icon: Icon; tone: GraphicTone }> = {
  sales: { icon: Handshake, tone: "info" },
  cs: { icon: Headset, tone: "success" },
  tracking: { icon: Boat, tone: "primary" },
  docs: { icon: FileText, tone: "neutral" },
  yard: { icon: SquaresFour, tone: "warning" },
  finance: { icon: Invoice, tone: "accent" },
  automation: { icon: Lightning, tone: "warning" },
};
