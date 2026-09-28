import type { Locale } from "../../i18n";
import type { DealStage, LeadStage } from "../../crm";
import type { Tone } from "../components";

const intlLocale: Record<Locale, string> = { zh: "zh-CN", th: "th-TH-u-ca-gregory", en: "en-GB" };

/**
 * CRM seed rows store short "MM-DD" stamps ("09-02"). Turn them into a real date in the current year
 * so they can go through fmtDate; pass anything else through unchanged.
 */
export function crmDate(v: string | null | undefined): string | Date | null {
  if (!v || v === "—") return null;
  const m = /^(\d{2})-(\d{2})$/.exec(v.trim());
  if (m) return new Date(new Date().getFullYear(), Number(m[1]) - 1, Number(m[2]));
  return v;
}

/** Whole-unit money for deal values and totals ("CN¥186,000"). */
export function fmtAmount(n: number | string | null | undefined, currency: string, locale: Locale): string {
  const v = typeof n === "string" ? Number(n) : n;
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  try {
    return new Intl.NumberFormat(intlLocale[locale], { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
  } catch {
    return `${currency} ${Math.round(v).toLocaleString()}`;
  }
}

export const leadStageTone: Record<LeadStage, Tone> = {
  new: "info",
  working: "progress",
  qualified: "success",
  lost: "neutral",
};

export const dealStageTone: Record<DealStage, Tone> = {
  qualify: "neutral",
  quote: "info",
  won: "success",
  book: "progress",
  billed: "success",
};

/** Case-insensitive "does any of these fields contain q". */
export function matches(q: string, ...fields: (string | number | null | undefined)[]): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  return fields.some((f) => f !== null && f !== undefined && String(f).toLowerCase().includes(needle));
}

export function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v && v !== "—")))].sort((a, b) => a.localeCompare(b));
}

/** "หยานเถียน → แหลมฉบัง" → { from, to } for LaneCell. */
export function splitLane(lane: string | null | undefined): { from: string; to: string } | null {
  if (!lane || lane === "—") return null;
  const parts = lane.split(/\s*(?:→|->|—>|⇒)\s*/);
  if (parts.length < 2) return null;
  return { from: parts[0]!, to: parts[parts.length - 1]! };
}

/** "5 Sep" — compact day + month for dense visuals (transit bars). */
export function fmtShortDate(v: string | Date | null | undefined, locale: Locale): string {
  if (!v || v === "—") return "—";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale[locale], { day: "numeric", month: "short" }).format(d);
}

/* ── Ports: place names (zh / th / en, as typed in lanes) → UN/LOCODE, so lanes can show flags ── */

export type PortDef = { code: string; zh: string; th: string; en: string; aliases?: string[] };

export const SALES_PORTS: PortDef[] = [
  { code: "THLCH", zh: "林查班", th: "แหลมฉบัง", en: "Laem Chabang" },
  { code: "THBKK", zh: "曼谷", th: "กรุงเทพ", en: "Bangkok" },
  { code: "THSPK", zh: "北榄", th: "สมุทรปราการ", en: "Samut Prakan" },
  { code: "THRYG", zh: "罗勇", th: "ระยอง", en: "Rayong" },
  { code: "THSGZ", zh: "宋卡", th: "สงขลา", en: "Songkhla" },
  { code: "CNSHA", zh: "上海", th: "เซี่ยงไฮ้", en: "Shanghai", aliases: ["外高桥", "ไว่เกาเฉียว", "Waigaoqiao"] },
  { code: "CNNGB", zh: "宁波", th: "หนิงโป", en: "Ningbo", aliases: ["北仑", "เป่ยหลุน", "Beilun"] },
  { code: "CNYTN", zh: "盐田", th: "หยานเถียน", en: "Yantian" },
  { code: "CNSZX", zh: "深圳", th: "เซินเจิ้น", en: "Shenzhen", aliases: ["蛇口", "Shekou"] },
  { code: "CNNSA", zh: "南沙", th: "หนานซา", en: "Nansha" },
  { code: "CNCAN", zh: "广州", th: "กวางโจว", en: "Guangzhou" },
  { code: "CNTAO", zh: "青岛", th: "ชิงเต่า", en: "Qingdao", aliases: ["前湾", "เฉียนวาน", "Qianwan"] },
  { code: "CNHUM", zh: "虎门", th: "หูเหมิน", en: "Humen" },
  { code: "CNYIW", zh: "义乌", th: "อี้อู", en: "Yiwu" },
  { code: "CNXMN", zh: "厦门", th: "เซียะเหมิน", en: "Xiamen" },
  { code: "CNTSN", zh: "天津", th: "เทียนจิน", en: "Tianjin" },
  { code: "HKHKG", zh: "香港", th: "ฮ่องกง", en: "Hong Kong" },
  { code: "VNSGN", zh: "胡志明", th: "โฮจิมินห์", en: "Ho Chi Minh" },
  { code: "VNHPH", zh: "海防", th: "ไฮฟอง", en: "Haiphong" },
  { code: "MYPKG", zh: "巴生", th: "พอร์ตกลัง", en: "Port Klang" },
  { code: "SGSIN", zh: "新加坡", th: "สิงคโปร์", en: "Singapore" },
];

const PORT_ALIASES: [string, string][] = SALES_PORTS.flatMap((p) =>
  [p.zh, p.th, p.en, p.code, ...(p.aliases ?? [])].map((a) => [a.toLowerCase(), p.code] as [string, string]),
).sort((a, b) => b[0].length - a[0].length);

/** "盐田" / "หยานเถียน" / "Yantian" / "CNYTN" → "CNYTN"; unknown → null. */
export function placeCode(place: string | null | undefined): string | null {
  const s = (place ?? "").trim();
  if (!s || s === "—") return null;
  if (/^[A-Z]{5}$/.test(s)) return s;
  const low = s.toLowerCase();
  for (const [alias, code] of PORT_ALIASES) if (low.includes(alias)) return code;
  return null;
}

export function portName(code: string | null | undefined, locale: Locale): string | undefined {
  const p = SALES_PORTS.find((x) => x.code === code);
  return p ? p[locale] : undefined;
}

/** Free-text lane → codes + place names for RouteTrack. */
export function laneRoute(
  lane: string | null | undefined,
): { from: string | null; to: string | null; fromName: string; toName: string } | null {
  const parts = splitLane(lane);
  if (!parts) return null;
  return { from: placeCode(parts.from), to: placeCode(parts.to), fromName: parts.from, toName: parts.to };
}

const MARK_TONES = ["primary", "info", "accent", "success", "warning"] as const;

/** Stable tone for a company/person initial mark. */
export function markTone(name: string): (typeof MARK_TONES)[number] {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return MARK_TONES[h % MARK_TONES.length]!;
}

/** Days from today until a date (negative = past). null when unknown. */
export function daysUntil(v: string | Date | null | undefined): number | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  return Math.round((day.getTime() - today.getTime()) / 86_400_000);
}

/** Tone names accepted by the Graphics kit (IconBadge, Board, SegmentBar…). */
export type GfxTone = "primary" | "accent" | "success" | "warning" | "danger" | "info" | "neutral";

/** Compact money for big card numbers ("฿186K", "US$1.2K"). */
export function fmtCompact(n: number | null | undefined, currency: string, locale: Locale): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  try {
    return new Intl.NumberFormat(intlLocale[locale], { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(
      n,
    );
  } catch {
    return `${currency} ${Math.round(n).toLocaleString()}`;
  }
}
