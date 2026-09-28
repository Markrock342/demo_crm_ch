/**
 * Locale-aware place names for yard / depot / port codes.
 *
 * Data stores neutral codes ("LCB-B1", "YTN-T3", "THLCH"); the UI translates them here.
 * A code may carry a yard slot suffix ("LCB-B1" → "แหลมฉบัง B1" / "林查班 B1" / "Laem Chabang B1").
 * Older Chinese-only labels ("林查班 B1") are recognised too, so legacy rows still translate.
 */

type Names = { zh: string; th: string; en: string };
type Loc = "zh" | "th" | "en";

const PLACES: Record<string, Names> = {
  // Thailand
  LCB: { zh: "林查班", th: "แหลมฉบัง", en: "Laem Chabang" },
  "LCB-EMPTY": { zh: "林查班空箱区", th: "ลานตู้เปล่า แหลมฉบัง", en: "Laem Chabang empty yard" },
  "LCB-QUAY": { zh: "林查班码头", th: "ท่าเรือแหลมฉบัง", en: "Laem Chabang quay" },
  BKK: { zh: "曼谷", th: "กรุงเทพฯ", en: "Bangkok" },
  "BKK-PAT": { zh: "曼谷港", th: "ท่าเรือกรุงเทพ", en: "Bangkok Port (PAT)" },
  "SPK-WH": { zh: "北榄仓", th: "คลังสมุทรปราการ", en: "Samut Prakan warehouse" },
  RYG: { zh: "罗勇", th: "ระยอง", en: "Rayong" },
  // China
  "YTN-T3": { zh: "盐田三期", th: "หยานเถียน เฟส 3", en: "Yantian Phase 3" },
  "YTN-YARD": { zh: "盐田堆场", th: "ลานตู้หยานเถียน", en: "Yantian yard" },
  YTN: { zh: "盐田", th: "หยานเถียน", en: "Yantian" },
  "NSA-T1": { zh: "南沙一期", th: "หนานซา เฟส 1", en: "Nansha Phase 1" },
  "NSA-HOLD": { zh: "南沙（待补单证）", th: "หนานซา (รอเอกสาร)", en: "Nansha (awaiting documents)" },
  NSA: { zh: "南沙", th: "หนานซา", en: "Nansha" },
  "YIW-BONDED": { zh: "义乌监管仓", th: "คลังทัณฑ์บนอี้อู", en: "Yiwu bonded warehouse" },
  "YIW-CFS": { zh: "义乌拼箱仓", th: "คลังรวมสินค้าอี้อู (CFS)", en: "Yiwu CFS" },
  YIW: { zh: "义乌", th: "อี้อู", en: "Yiwu" },
  "HMN-BARGE": { zh: "虎门驳运", th: "เรือลำเลียงหู่เหมิน", en: "Humen barge" },
  "SHA-WGQ": { zh: "上海外高桥", th: "เซี่ยงไฮ้ ไวเกาเฉียว", en: "Shanghai Waigaoqiao" },
  NGB: { zh: "宁波", th: "หนิงโป", en: "Ningbo" },
  TAO: { zh: "青岛", th: "ชิงเต่า", en: "Qingdao" },
  // UN/LOCODE ports
  THLCH: { zh: "林查班", th: "แหลมฉบัง", en: "Laem Chabang" },
  THBKK: { zh: "曼谷", th: "กรุงเทพฯ", en: "Bangkok" },
  CNYTN: { zh: "盐田", th: "หยานเถียน", en: "Yantian" },
  CNNSA: { zh: "南沙", th: "หนานซา", en: "Nansha" },
  CNNGB: { zh: "宁波", th: "หนิงโป", en: "Ningbo" },
  CNTAO: { zh: "青岛", th: "ชิงเต่า", en: "Qingdao" },
  CNSHA: { zh: "上海", th: "เซี่ยงไฮ้", en: "Shanghai" },
  CNHMN: { zh: "虎门", th: "หู่เหมิน", en: "Humen" },
  CNXMN: { zh: "厦门", th: "เซี่ยเหมิน", en: "Xiamen" },
  CNSHK: { zh: "蛇口", th: "เสอโข่ว", en: "Shekou" },
};

/** Legacy Chinese labels → codes (old seed data). */
const LEGACY: Record<string, string> = {
  盐田三期: "YTN-T3",
  盐田堆存: "YTN-YARD",
  南沙一期: "NSA-T1",
  南沙待补: "NSA-HOLD",
  义乌监管仓: "YIW-BONDED",
  义乌拼箱: "YIW-CFS",
  虎门驳运: "HMN-BARGE",
  林查班空箱区: "LCB-EMPTY",
  林查班码头: "LCB-QUAY",
  北榄仓: "SPK-WH",
  林查班: "LCB",
};

const SLOT = /^[A-Z]{1,2}\d{1,3}$/;

function pick(n: Names, locale: string): string {
  return n[(locale === "zh" || locale === "th" ? locale : "en") as Loc];
}

/** Human place name for a code / legacy label in the given locale; unknown input is returned as-is. */
export function placeName(code: string | null | undefined, locale: string): string {
  const raw = (code ?? "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (PLACES[upper]) return pick(PLACES[upper], locale);

  // CODE-SLOT, e.g. LCB-B1
  const dash = upper.lastIndexOf("-");
  if (dash > 0) {
    const base = upper.slice(0, dash);
    const slot = upper.slice(dash + 1);
    if (PLACES[base] && SLOT.test(slot)) return `${pick(PLACES[base], locale)} ${slot}`;
  }

  // Legacy Chinese label, optionally "林查班 B1"
  if (LEGACY[raw]) return pick(PLACES[LEGACY[raw]]!, locale);
  const m = raw.match(/^(\S+)\s+([A-Z]{1,2}\d{1,3})$/i);
  if (m && LEGACY[m[1]!]) return `${pick(PLACES[LEGACY[m[1]!]]!, locale)} ${m[2]!.toUpperCase()}`;

  return raw;
}
