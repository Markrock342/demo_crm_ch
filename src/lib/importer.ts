/**
 * Excel / CSV import: field definitions, cell parsing and per-row validation shared by the
 * import page (src/v2/pages/ImportPage.tsx) and the bulk endpoints (server/routes/import.ts).
 * Dependency-free so both Vite and Node can import it. The server re-runs `validateRow` on every
 * row it receives, so the browser preview and the saved result always agree.
 */
import {
  BUSINESS_TYPES,
  CONTAINER_TYPES,
  CURRENCIES,
  CUSTOMER_STATUSES,
  INCOTERMS,
  LEAD_SOURCES,
  PAYMENT_METHODS,
  isPortCode,
  isValidEmail,
  isValidThaiTaxId,
  normalizeBranchNo,
  normalizeTaxId,
} from "./customerProfile.js";

export const IMPORT_ENTITIES = ["customers", "contacts", "rates", "jobs"] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

/** Rows accepted per upload (one batch = one request = one transaction). */
export const IMPORT_MAX_ROWS = 2000;
/** An import can be undone for this long after it ran. */
export const IMPORT_UNDO_HOURS = 24;

export const RATE_MODES = ["SEA_FCL", "SEA_LCL", "AIR"] as const;
export const JOB_DIRECTIONS = ["IMPORT", "EXPORT"] as const;
/** Jobs that are still running; closed history is not imported. */
export const OPEN_JOB_STATUSES = ["BOOKING", "GATE_IN", "SAIL", "ARRIVED"] as const;

export type FieldType = "text" | "number" | "int" | "date" | "email" | "port" | "enum" | "list" | "bool" | "taxId" | "branch" | "country" | "currency";

export type FieldDef = {
  key: string;
  type: FieldType;
  required?: boolean;
  /** Allowed codes for enum / list-of-enum fields. */
  values?: readonly string[];
  /** Extra header spellings (the page adds the translated labels from all three languages). */
  aliases?: string[];
  /** Example value shown in the template guide sheet. */
  example?: string;
};

const f = (key: string, type: FieldType, extra: Omit<FieldDef, "key" | "type"> = {}): FieldDef => ({ key, type, ...extra });

export const IMPORT_FIELDS: Record<ImportEntity, FieldDef[]> = {
  customers: [
    f("nameTh", "text", { aliases: ["name th", "ชื่อบริษัท", "ชื่อลูกค้า", "ชื่อ"], example: "บริษัท สยามเทรด จำกัด" }),
    f("nameEn", "text", { aliases: ["name", "company", "company name", "customer", "customer name", "name en"], example: "Siam Trade Co., Ltd." }),
    f("nameZh", "text", { aliases: ["name zh", "客户", "客户名称", "公司名称", "中文名"], example: "暹罗贸易有限公司" }),
    f("taxId", "taxId", { aliases: ["tax id", "tax no", "taxid", "เลขผู้เสียภาษี", "เลขประจำตัวผู้เสียภาษี", "税号"], example: "0105558000014" }),
    f("branchNo", "branch", { aliases: ["branch", "branch no", "สาขา", "สาขาที่", "分支"], example: "00000" }),
    f("country", "country", { aliases: ["ประเทศ", "国家"], example: "TH" }),
    f("city", "text", { aliases: ["จังหวัด", "เมือง", "城市"], example: "Bangkok" }),
    f("billingAddress", "text", { aliases: ["address", "ที่อยู่", "ที่อยู่ออกใบกำกับ", "地址"], example: "99 ถ.พระราม 4 กรุงเทพฯ 10110" }),
    f("billingEmail", "email", { aliases: ["email", "อีเมล", "อีเมลบัญชี", "邮箱"], example: "ap@siamtrade.co.th" }),
    f("currency", "currency", { aliases: ["สกุลเงิน", "币种"], values: CURRENCIES, example: "THB" }),
    f("creditTermDays", "int", { aliases: ["credit term", "credit days", "เครดิต", "เครดิตเทอม", "账期"], example: "30" }),
    f("creditLimit", "number", { aliases: ["วงเงิน", "วงเงินเครดิต", "信用额度"], example: "500,000" }),
    f("paymentMethod", "enum", { values: PAYMENT_METHODS, aliases: ["payment", "การชำระเงิน", "付款方式"], example: "transfer" }),
    f("businessType", "enum", { values: BUSINESS_TYPES, aliases: ["type", "ประเภทธุรกิจ", "业务类型"], example: "importer" }),
    f("industry", "text", { aliases: ["สินค้าหลัก", "อุตสาหกรรม", "行业"], example: "Auto parts" }),
    f("website", "text", { aliases: ["web", "เว็บไซต์", "网站"] }),
    f("leadSource", "enum", { values: LEAD_SOURCES, aliases: ["source", "ที่มา", "来源"] }),
    f("status", "enum", { values: CUSTOMER_STATUSES, aliases: ["สถานะ", "状态"], example: "active" }),
    f("incoterms", "enum", { values: INCOTERMS, aliases: ["incoterm", "เงื่อนไขการค้า", "贸易条款"], example: "FOB" }),
    f("pol", "port", { aliases: ["ท่าต้นทาง", "起运港", "origin port"], example: "CNSHA" }),
    f("pod", "port", { aliases: ["ท่าปลายทาง", "目的港", "destination port"], example: "THLCH" }),
    f("containerTypes", "list", { values: CONTAINER_TYPES, aliases: ["container", "containers", "ประเภทตู้", "箱型"], example: "40HC, 20GP" }),
    f("commodities", "list", { aliases: ["commodity", "สินค้า", "货物"], example: "Auto parts" }),
    f("contactName", "text", { aliases: ["contact", "ผู้ติดต่อ", "联系人"], example: "คุณสมชาย" }),
    f("contactPhone", "text", { aliases: ["phone", "tel", "โทร", "เบอร์โทร", "电话"], example: "081-234-5678" }),
    f("contactEmail", "email", { aliases: ["contact email", "อีเมลผู้ติดต่อ"] }),
    f("contactLine", "text", { aliases: ["line", "line id", "ไลน์"] }),
    f("notes", "text", { aliases: ["note", "remark", "remarks", "หมายเหตุ", "备注"] }),
  ],
  contacts: [
    f("customer", "text", { required: true, aliases: ["customer name", "company", "ลูกค้า", "บริษัท", "客户", "tax id", "เลขผู้เสียภาษี"], example: "บริษัท สยามเทรด จำกัด" }),
    f("name", "text", { required: true, aliases: ["contact", "contact name", "ชื่อ", "ชื่อผู้ติดต่อ", "姓名", "联系人"], example: "คุณสมชาย ใจดี" }),
    f("title", "text", { aliases: ["position", "ตำแหน่ง", "职位"], example: "Purchasing manager" }),
    f("email", "email", { aliases: ["อีเมล", "邮箱"], example: "somchai@siamtrade.co.th" }),
    f("phone", "text", { aliases: ["tel", "mobile", "โทร", "เบอร์โทร", "电话", "手机"], example: "081-234-5678" }),
    f("wechat", "text", { aliases: ["微信"] }),
    f("lineId", "text", { aliases: ["line", "ไลน์"] }),
    f("primary", "bool", { aliases: ["main", "หลัก", "ผู้ติดต่อหลัก", "主要"], example: "Y" }),
  ],
  rates: [
    f("vendor", "text", { required: true, aliases: ["supplier", "ซัพพลายเออร์", "供应商"], example: "COSCO Shipping (Thailand)" }),
    f("carrier", "text", { aliases: ["line", "shipping line", "สายเรือ", "船公司"], example: "COSCO" }),
    f("pol", "port", { required: true, aliases: ["ท่าต้นทาง", "起运港", "origin port"], example: "CNSHA" }),
    f("pod", "port", { required: true, aliases: ["ท่าปลายทาง", "目的港", "destination port"], example: "THLCH" }),
    f("origin", "text", { aliases: ["ต้นทาง", "起运地"], example: "Shanghai" }),
    f("destination", "text", { aliases: ["ปลายทาง", "目的地"], example: "Laem Chabang" }),
    f("containerType", "enum", { values: CONTAINER_TYPES, aliases: ["container", "ประเภทตู้", "箱型"], example: "40HC" }),
    f("mode", "enum", { values: RATE_MODES, aliases: ["โหมด", "运输方式"], example: "SEA_FCL" }),
    f("validFrom", "date", { required: true, aliases: ["from", "valid from", "เริ่ม", "มีผลตั้งแต่", "生效日"], example: "01/10/2569" }),
    f("validUntil", "date", { required: true, aliases: ["to", "until", "valid to", "หมดอายุ", "ถึง", "有效期至"], example: "31/12/2569" }),
    f("currency", "currency", { aliases: ["สกุลเงิน", "币种"], values: ["THB", "USD", "CNY"], example: "USD" }),
    f("buyPrice", "number", { aliases: ["buy", "cost", "ราคาทุน", "ต้นทุน", "成本"], example: "850" }),
    f("sellPrice", "number", { aliases: ["sell", "price", "ราคาขาย", "售价"], example: "1,050" }),
    f("sheetName", "text", { aliases: ["sheet", "ชื่อชุดราคา", "运价表"] }),
    f("notes", "text", { aliases: ["note", "หมายเหตุ", "备注"] }),
  ],
  jobs: [
    f("customer", "text", { required: true, aliases: ["ลูกค้า", "客户", "customer name", "company"], example: "บริษัท สยามเทรด จำกัด" }),
    f("jobNumber", "text", { aliases: ["job", "job no", "job number", "เลขที่ job", "工作单号"], example: "" }),
    f("direction", "enum", { values: JOB_DIRECTIONS, aliases: ["นำเข้า/ส่งออก", "ประเภทงาน", "进出口"], example: "IMPORT" }),
    f("pol", "port", { required: true, aliases: ["ท่าต้นทาง", "起运港"], example: "CNSHA" }),
    f("pod", "port", { required: true, aliases: ["ท่าปลายทาง", "目的港"], example: "THLCH" }),
    f("origin", "text", { aliases: ["ต้นทาง", "起运地"] }),
    f("destination", "text", { aliases: ["ปลายทาง", "目的地"] }),
    f("etd", "date", { aliases: ["วันเรือออก", "预计开船"], example: "05/10/2569" }),
    f("eta", "date", { aliases: ["วันเรือถึง", "预计到港"], example: "12/10/2569" }),
    f("carrier", "text", { aliases: ["สายเรือ", "船公司"], example: "COSCO" }),
    f("vessel", "text", { aliases: ["เรือ", "ชื่อเรือ", "船名"], example: "COSCO SHIPPING ARIES" }),
    f("voyage", "text", { aliases: ["เที่ยวเรือ", "航次"], example: "118S" }),
    f("bookingNumber", "text", { aliases: ["booking", "booking no", "เลข booking", "订舱号"] }),
    f("masterBl", "text", { aliases: ["mbl", "master b/l", "mb/l"] }),
    f("houseBl", "text", { aliases: ["hbl", "house b/l", "hb/l", "b/l", "提单号"] }),
    f("containerType", "enum", { values: CONTAINER_TYPES, aliases: ["container", "ประเภทตู้", "箱型"], example: "40HC" }),
    f("containerCount", "int", { aliases: ["containers", "qty", "จำนวนตู้", "箱量"], example: "2" }),
    f("commodity", "text", { aliases: ["สินค้า", "货物", "品名"], example: "Auto parts" }),
    f("incoterm", "enum", { values: INCOTERMS, aliases: ["incoterms", "贸易条款"], example: "FOB" }),
    f("status", "enum", { values: OPEN_JOB_STATUSES, aliases: ["สถานะ", "状态"], example: "BOOKING" }),
    f("mode", "enum", { values: RATE_MODES, aliases: ["โหมด", "运输方式"], example: "SEA_FCL" }),
  ],
};

/* ── Cell parsing ─────────────────────────────────────────────── */

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

/** Thai digits → Arabic, full-width → half-width, trim. */
export function cleanCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  // NFC, not NFKC: NFKC splits Thai sara am (ำ) into two characters.
  let s = String(v)
    .normalize("NFC")
    .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ");
  s = s.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));
  return s.replace(/ /g, " ").trim();
}

/** Header → comparable token: lower-case, letters / marks / digits only ("Tax ID *" → "taxid"). */
export function normalizeHeader(h: unknown): string {
  return cleanCell(h)
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]/gu, "");
}

/** "1,234.50" / "฿ 1 234" / "(500)" / 1234 → number; "" → null; garbage → NaN. */
export function parseNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : Number.NaN;
  let s = cleanCell(v);
  if (!s || s === "-") return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[\s,฿$¥￥€]|บาท|thb|usd|cny|rmb|元/gi, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return Number.NaN;
  const n = Number(s);
  return neg ? -n : n;
}

const MONTHS: Record<string, number> = {};
[
  ["ม.ค.", "มกราคม", "jan", "january"],
  ["ก.พ.", "กุมภาพันธ์", "feb", "february"],
  ["มี.ค.", "มีนาคม", "mar", "march"],
  ["เม.ย.", "เมษายน", "apr", "april"],
  ["พ.ค.", "พฤษภาคม", "may"],
  ["มิ.ย.", "มิถุนายน", "jun", "june"],
  ["ก.ค.", "กรกฎาคม", "jul", "july"],
  ["ส.ค.", "สิงหาคม", "aug", "august"],
  ["ก.ย.", "กันยายน", "sep", "sept", "september"],
  ["ต.ค.", "ตุลาคม", "oct", "october"],
  ["พ.ย.", "พฤศจิกายน", "nov", "november"],
  ["ธ.ค.", "ธันวาคม", "dec", "december"],
].forEach((names, i) => names.forEach((n) => (MONTHS[n.replace(/\./g, "")] = i + 1)));

/** Buddhist-era years (2400+) → Gregorian: 2569 → 2026. */
export function toGregorianYear(y: number): number {
  return y >= 2400 ? y - 543 : y;
}

/** Two-digit years: 50–99 are read as Buddhist (69 → 2569 → 2026), 00–49 as 20xx. */
function expandYear(y: number, digits: number): number {
  if (digits > 2) return toGregorianYear(y);
  return y >= 50 ? 2500 + y - 543 : 2000 + y;
}

function iso(y: number, m: number, d: number): string | null {
  if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export type DateResult = { value: string | null; error?: string; warning?: string };

/** Excel serial day number (1900 system) → Y/M/D in UTC. */
function fromSerial(n: number): [number, number, number] {
  const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
}

/**
 * Dates as people type them in Thailand: dd/mm/yyyy (Buddhist or Gregorian year), d-m-yy,
 * yyyy-mm-dd, "15 ต.ค. 2569", "15 Oct 2026", Excel serial numbers and JS Dates.
 * Returns an ISO "YYYY-MM-DD" string.
 */
export function parseDate(v: unknown): DateResult {
  if (v === null || v === undefined || v === "") return { value: null };
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { value: null, error: "invalid_date" };
    const out = iso(toGregorianYear(v.getFullYear()), v.getMonth() + 1, v.getDate());
    return out ? { value: out } : { value: null, error: "invalid_date" };
  }
  if (typeof v === "number") {
    if (v < 1 || v > 400000) return { value: null, error: "invalid_date" };
    const [y, m, d] = fromSerial(v);
    const out = iso(toGregorianYear(y), m, d);
    return out ? { value: out } : { value: null, error: "invalid_date" };
  }
  const s = cleanCell(v).replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, "");
  if (!s) return { value: null };

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) {
    const out = iso(toGregorianYear(Number(m[1])), Number(m[2]), Number(m[3]));
    return out ? { value: out } : { value: null, error: "invalid_date" };
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    let a = Number(m[1]);
    let b = Number(m[2]);
    const y = expandYear(Number(m[3]), m[3]!.length);
    let warning: string | undefined;
    // Day first; only swap when the text cannot be day/month (e.g. 10/25/2026).
    if (b > 12 && a <= 12) {
      [a, b] = [b, a];
      warning = "date_month_first";
    }
    if (m[3]!.length === 2) warning = warning ?? "date_short_year";
    const out = iso(y, b, a);
    return out ? { value: out, warning } : { value: null, error: "invalid_date" };
  }
  m = /^(\d{1,2})\s*[- ]?\s*([\p{L}\p{M}.]+)\s*[- ,]?\s*(\d{2}|\d{4})$/u.exec(s);
  if (m) {
    const month = MONTHS[m[2]!.toLowerCase().replace(/\./g, "")];
    if (!month) return { value: null, error: "invalid_date" };
    const out = iso(expandYear(Number(m[3]), m[3]!.length), month, Number(m[1]));
    return out ? { value: out } : { value: null, error: "invalid_date" };
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) return parseDate(Number(s));
  return { value: null, error: "invalid_date" };
}

export function parseBool(v: unknown): boolean | null | undefined {
  if (typeof v === "boolean") return v;
  const s = cleanCell(v).toLowerCase();
  if (!s) return null;
  if (["y", "yes", "true", "1", "x", "✓", "ใช่", "หลัก", "是", "主要"].includes(s)) return true;
  if (["n", "no", "false", "0", "-", "ไม่", "ไม่ใช่", "否"].includes(s)) return false;
  return undefined;
}

/** Word → code for enums people type in Thai / Chinese / English. Keys are normalizeHeader()-ed. */
const ENUM_ALIASES: Record<string, string> = {};
function alias(code: string, ...words: string[]) {
  for (const w of words) ENUM_ALIASES[normalizeHeader(w)] = code;
}
alias("importer", "ผู้นำเข้า", "นำเข้า", "进口商");
alias("exporter", "ผู้ส่งออก", "ส่งออก", "出口商");
alias("manufacturer", "ผู้ผลิต", "โรงงาน", "生产商", "工厂");
alias("trading", "เทรดดิ้ง", "บริษัทการค้า", "贸易公司");
alias("forwarder", "ฟอร์เวิร์ดเดอร์", "ชิปปิ้ง", "货代", "同行");
alias("active", "ใช้งาน", "ปกติ", "合作中", "正常");
alias("on_hold", "on hold", "hold", "ระงับ", "พักไว้", "暂停");
alias("inactive", "ไม่ใช้งาน", "เลิกใช้", "停用");
alias("transfer", "bank transfer", "โอน", "โอนเงิน", "转账");
alias("cheque", "check", "เช็ค", "支票");
alias("cash", "เงินสด", "现金");
alias("tt", "t/t", "电汇");
alias("referral", "แนะนำ", "转介绍");
alias("exhibition", "งานแสดงสินค้า", "展会");
alias("SEA_FCL", "fcl", "sea fcl", "เต็มตู้", "整箱");
alias("SEA_LCL", "lcl", "sea lcl", "รวมตู้", "拼箱");
alias("AIR", "ทางอากาศ", "空运");
alias("IMPORT", "im", "imp", "นำเข้า", "ขาเข้า", "进口");
alias("EXPORT", "ex", "exp", "ส่งออก", "ขาออก", "出口");
alias("BOOKING", "booked", "จอง", "จองแล้ว", "订舱");
alias("GATE_IN", "gate in", "เข้าท่า", "进港");
alias("SAIL", "sailed", "sailing", "เรือออกแล้ว", "เดินทาง", "已开船");
alias("ARRIVED", "arrive", "ถึงท่าแล้ว", "เรือถึงแล้ว", "已到港");
alias("LCL", "รวมตู้");

/** "40'HC" / "40 HQ" / "40hc" → "40HC". */
function containerCode(raw: string): string {
  const s = raw.toUpperCase().replace(/['’"\s-]/g, "").replace(/HQ$/, "HC").replace(/DV$|DC$|STD$/, "GP").replace(/^(\d\d)RH$/, "$1RF");
  return s;
}

function matchEnum(raw: string, values: readonly string[]): string | null {
  const s = cleanCell(raw);
  if (!s) return null;
  const up = s.toUpperCase().replace(/[\s-]/g, "_");
  const direct = values.find((v) => v.toUpperCase() === up);
  if (direct) return direct;
  if (values === CONTAINER_TYPES || values.includes("40HC")) {
    const c = containerCode(s);
    if (values.includes(c)) return c;
  }
  const a = ENUM_ALIASES[normalizeHeader(s)];
  if (a && values.includes(a)) return a;
  return null;
}

const COUNTRY_ALIASES: Record<string, string> = {};
[
  ["TH", "thailand", "ไทย", "ประเทศไทย", "泰国"],
  ["CN", "china", "จีน", "ประเทศจีน", "中国"],
  ["HK", "hong kong", "ฮ่องกง", "香港"],
  ["VN", "vietnam", "เวียดนาม", "越南"],
  ["MY", "malaysia", "มาเลเซีย", "马来西亚"],
  ["SG", "singapore", "สิงคโปร์", "新加坡"],
  ["ID", "indonesia", "อินโดนีเซีย", "印度尼西亚"],
  ["KH", "cambodia", "กัมพูชา", "柬埔寨"],
  ["LA", "laos", "ลาว", "老挝"],
  ["MM", "myanmar", "เมียนมา", "พม่า", "缅甸"],
  ["JP", "japan", "ญี่ปุ่น", "日本"],
  ["KR", "korea", "south korea", "เกาหลี", "韩国"],
  ["US", "usa", "united states", "อเมริกา", "สหรัฐอเมริกา", "美国"],
].forEach(([code, ...names]) => names.forEach((n) => (COUNTRY_ALIASES[normalizeHeader(n)] = code!)));

const CURRENCY_ALIASES: Record<string, string> = {
  [normalizeHeader("บาท")]: "THB",
  [normalizeHeader("฿")]: "THB",
  [normalizeHeader("泰铢")]: "THB",
  [normalizeHeader("ดอลลาร์")]: "USD",
  [normalizeHeader("$")]: "USD",
  [normalizeHeader("美元")]: "USD",
  [normalizeHeader("หยวน")]: "CNY",
  [normalizeHeader("rmb")]: "CNY",
  [normalizeHeader("人民币")]: "CNY",
};

/** "a, b; c、d" / new lines → trimmed unique items. */
export function splitList(v: unknown): string[] {
  return [
    ...new Set(
      cleanCell(v)
        .split(/[,;、，；|\n]+/)
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ];
}

/* ── Row validation ───────────────────────────────────────────── */

export type Issue = { field: string; code: string };
export type RowCheck = { values: Record<string, unknown>; errors: Issue[]; warnings: Issue[] };

/** Parse one cell by field type; pushes errors / warnings. */
function parseField(def: FieldDef, raw: unknown, errors: Issue[], warnings: Issue[]): unknown {
  const s = cleanCell(raw);
  const empty = s === "" && typeof raw !== "number" && !(raw instanceof Date);
  if (empty) {
    if (def.required) errors.push({ field: def.key, code: "required" });
    return def.type === "list" ? [] : null;
  }
  const bad = (code: string) => {
    errors.push({ field: def.key, code });
    return null;
  };
  switch (def.type) {
    case "text":
      return s.length > 1000 ? bad("too_long") : s;
    case "number":
    case "int": {
      const n = parseNumber(raw);
      if (n === null) return null;
      if (Number.isNaN(n)) return bad("invalid_number");
      if (n < 0) return bad("negative");
      if (def.type === "int") {
        if (!Number.isInteger(n)) return bad("invalid_integer");
      }
      return n;
    }
    case "date": {
      const r = parseDate(raw);
      if (r.error) return bad(r.error);
      if (r.warning) warnings.push({ field: def.key, code: r.warning });
      return r.value;
    }
    case "email":
      return isValidEmail(s) ? s.toLowerCase() : bad("invalid_email");
    case "port": {
      const code = s.toUpperCase().replace(/\s+/g, "");
      return isPortCode(code) ? code : bad("invalid_port");
    }
    case "enum": {
      const v = matchEnum(s, def.values ?? []);
      return v ?? bad("invalid_choice");
    }
    case "list": {
      const items = splitList(raw);
      if (!def.values) return items;
      const out: string[] = [];
      for (const it of items) {
        const v = matchEnum(it, def.values);
        if (!v) return bad("invalid_choice");
        if (!out.includes(v)) out.push(v);
      }
      return out;
    }
    case "bool": {
      const b = parseBool(raw);
      return b === undefined ? bad("invalid_choice") : b;
    }
    case "taxId": {
      const t = normalizeTaxId(typeof raw === "number" ? raw.toFixed(0).padStart(13, "0") : s);
      return t.length > 30 ? bad("too_long") : t;
    }
    case "branch": {
      const t = typeof raw === "number" ? String(raw) : s;
      if (/^(สำนักงานใหญ่|head ?office|ho|总公司|总部)$/i.test(t)) return null;
      return normalizeBranchNo(t);
    }
    case "country": {
      const up = s.toUpperCase();
      if (/^[A-Z]{2}$/.test(up)) return up;
      return COUNTRY_ALIASES[normalizeHeader(s)] ?? bad("invalid_choice");
    }
    case "currency": {
      const up = s.toUpperCase();
      const code = /^[A-Z]{3}$/.test(up) ? (up === "RMB" ? "CNY" : up) : CURRENCY_ALIASES[normalizeHeader(s)];
      if (!code) return bad("invalid_choice");
      if (def.values && !def.values.includes(code)) return bad("invalid_choice");
      return code;
    }
  }
}

/** Validate one mapped row (`raw` keyed by field key). Pure: no database look-ups. */
export function validateRow(entity: ImportEntity, raw: Record<string, unknown>): RowCheck {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const values: Record<string, unknown> = {};
  for (const def of IMPORT_FIELDS[entity]) values[def.key] = parseField(def, raw[def.key], errors, warnings);
  const has = (k: string) => !errors.some((e) => e.field === k);

  if (entity === "customers") {
    if (!values.nameTh && !values.nameEn && !values.nameZh && has("nameTh")) errors.push({ field: "nameTh", code: "name_required" });
    const tax = values.taxId as string | null;
    if (tax && has("taxId") && ((values.country as string | null) ?? "TH") === "TH" && !isValidThaiTaxId(tax)) {
      errors.push({ field: "taxId", code: "invalid_thai_tax_id" });
    }
    if (values.creditTermDays != null && (values.creditTermDays as number) > 365) errors.push({ field: "creditTermDays", code: "out_of_range" });
    if ((values.pol && !values.pod && has("pod")) || (!values.pol && values.pod && has("pol"))) {
      errors.push({ field: values.pol ? "pod" : "pol", code: "required" });
    }
    if (values.pol && values.pol === values.pod) errors.push({ field: "pod", code: "same_port" });
    if (values.currency && !(CURRENCIES as readonly string[]).includes(values.currency as string)) errors.push({ field: "currency", code: "invalid_choice" });
  }

  if (entity === "rates") {
    if (values.pol && values.pol === values.pod) errors.push({ field: "pod", code: "same_port" });
    if (values.validFrom && values.validUntil && (values.validUntil as string) < (values.validFrom as string)) {
      errors.push({ field: "validUntil", code: "before_start" });
    }
    if (values.buyPrice == null && values.sellPrice == null && has("buyPrice") && has("sellPrice")) {
      errors.push({ field: "sellPrice", code: "price_required" });
    }
    if (values.validUntil && (values.validUntil as string) < todayIso()) warnings.push({ field: "validUntil", code: "already_expired" });
    if (values.buyPrice != null && values.sellPrice != null && (values.sellPrice as number) < (values.buyPrice as number)) {
      warnings.push({ field: "sellPrice", code: "below_cost" });
    }
    if (!values.mode) values.mode = values.containerType === "LCL" ? "SEA_LCL" : "SEA_FCL";
    if (!values.currency) values.currency = "USD";
  }

  if (entity === "jobs") {
    if (values.pol && values.pol === values.pod) errors.push({ field: "pod", code: "same_port" });
    if (values.etd && values.eta && (values.eta as string) < (values.etd as string)) errors.push({ field: "eta", code: "before_etd" });
    if (!values.status) values.status = "BOOKING";
    if (!values.mode) values.mode = values.containerType === "LCL" ? "SEA_LCL" : "SEA_FCL";
    if (!values.direction) values.direction = typeof values.pod === "string" && values.pod.startsWith("TH") ? "IMPORT" : "EXPORT";
    if (values.containerCount == null && values.containerType) values.containerCount = 1;
  }

  return { values, errors, warnings };
}

export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Compare company names loosely: case, spaces and punctuation ignored; common Thai/English company suffixes dropped. */
export function nameKey(name: unknown): string {
  return normalizeHeader(
    cleanCell(name)
      .toLowerCase()
      .replace(/บริษัท|จำกัด\s*\(มหาชน\)|จำกัด|หจก\.?|ห้างหุ้นส่วน|co\.?,?\s*ltd\.?|company limited|limited|ltd\.?|inc\.?|corp\.?|pcl\.?|public company|有限公司|股份/g, ""),
  );
}

/**
 * Header → field key. Exact normalized matches win; then a header that contains a field alias
 * (longest alias first), so "ชื่อบริษัท (ไทย) *" still maps.
 * `labels` adds the translated field labels per key.
 */
export function autoMap(entity: ImportEntity, headers: string[], labels: Record<string, string[]> = {}): (string | null)[] {
  const cands: { key: string; token: string }[] = [];
  for (const def of IMPORT_FIELDS[entity]) {
    for (const a of [def.key, ...(def.aliases ?? []), ...(labels[def.key] ?? [])]) {
      const token = normalizeHeader(a);
      if (token) cands.push({ key: def.key, token });
    }
  }
  const used = new Set<string>();
  const out: (string | null)[] = headers.map(() => null);
  const norm = headers.map(normalizeHeader);
  // Labels first (exact), so the page's own template headers always map to their own field.
  norm.forEach((h, i) => {
    const hit = cands.find((c) => c.token === h && !used.has(c.key));
    if (h && hit) {
      out[i] = hit.key;
      used.add(hit.key);
    }
  });
  const byLength = [...cands].sort((a, b) => b.token.length - a.token.length);
  norm.forEach((h, i) => {
    if (out[i] || !h) return;
    const hit = byLength.find((c) => c.token.length >= 3 && h.includes(c.token) && !used.has(c.key));
    if (hit) {
      out[i] = hit.key;
      used.add(hit.key);
    }
  });
  return out;
}

/** Container type → TEU per box. */
export function teuPerBox(type: string | null | undefined): number {
  if (!type || type === "LCL") return 0;
  return type.startsWith("20") ? 1 : 2;
}
