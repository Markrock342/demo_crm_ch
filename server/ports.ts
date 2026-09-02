export type CanonicalPort = {
  code: string;
  zh: string;
  th: string;
  en: string;
};

const PORTS: (CanonicalPort & { aliases: string[] })[] = [
  { code: "LCH", zh: "林查班", th: "แหลมฉบัง", en: "Laem Chabang", aliases: ["lch", "lcb", "lcbth", "laem chabang", "laemchabang", "แหลมฉบัง", "林查班"] },
  { code: "BKK", zh: "曼谷", th: "กรุงเทพ", en: "Bangkok", aliases: ["bkk", "bangkok", "คลองเตย", "空功", "曼谷", "กรุงเทพ"] },
  { code: "BKKL", zh: "北榄", th: "สมุทรปราการ", en: "Samut Prakan", aliases: ["samut prakan", "北榄", "สมุทรปราการ", "paknam"] },
  { code: "RYG", zh: "罗勇", th: "ระยอง", en: "Rayong", aliases: ["rayong", "罗勇", "ระยอง"] },
  { code: "YTN", zh: "盐田", th: "หยานเถียน", en: "Yantian", aliases: ["ytn", "yantian", "盐田", "หยานเถียน", "szytn"] },
  { code: "NGB", zh: "宁波", th: "หนิงโป", en: "Ningbo", aliases: ["ngb", "ningbo", "北仑", "beilun", "宁波", "หนิงโป"] },
  { code: "NSA", zh: "南沙", th: "หนานซา", en: "Nansha", aliases: ["nsa", "nansha", "南沙", "หนานซา"] },
  { code: "TAO", zh: "青岛", th: "ชิงเต่า", en: "Qingdao", aliases: ["tao", "qingdao", "前湾", "青岛", "ชิงเต่า"] },
  { code: "SHA", zh: "上海", th: "เซี่ยงไฮ้", en: "Shanghai", aliases: ["sha", "shanghai", "外高桥", "上海", "เซี่ยงไฮ้"] },
];

const DOCS: { code: string; aliases: string[] }[] = [
  { code: "C/O", aliases: ["c/o", "co", "产地证", "原产地", "certificate of origin", "ใบรับรองแหล่งกำเนิด", "form e", "form-e"] },
  { code: "B/L", aliases: ["b/l", "bl", "提单", "bill of lading", "ใบตราส่ง"] },
  { code: "PL", aliases: ["packing list", "装箱单", "รายการบรรจุ"] },
  { code: "CI", aliases: ["commercial invoice", "发票", "ใบกำกับสินค้า"] },
];

function fold(s: string) {
  return s.trim().toLowerCase().replaceAll(/\s+/g, " ");
}

export function normalizePort(raw: string | null | undefined): CanonicalPort | null {
  if (!raw?.trim()) return null;
  const q = fold(raw);
  for (const p of PORTS) {
    if (fold(p.code) === q || fold(p.zh) === q || fold(p.th) === q || fold(p.en) === q) {
      return { code: p.code, zh: p.zh, th: p.th, en: p.en };
    }
    if (p.aliases.some((a) => q.includes(fold(a)) || fold(a).includes(q))) {
      return { code: p.code, zh: p.zh, th: p.th, en: p.en };
    }
  }
  return null;
}

export function normalizeDoc(raw: string): string {
  const q = fold(raw);
  for (const d of DOCS) {
    if (d.aliases.some((a) => q.includes(fold(a)))) return d.code;
  }
  return raw.trim();
}

export function formatPort(p: CanonicalPort | null, locale: "zh" | "th" | "en") {
  if (!p) return "";
  if (locale === "th") return `${p.th} (${p.code})`;
  if (locale === "en") return `${p.en} (${p.code})`;
  return `${p.zh} (${p.code})`;
}
