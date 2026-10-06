import {
  Buildings,
  ChatCircleDots,
  DotsThreeCircle,
  EnvelopeSimple,
  FacebookLogo,
  Globe,
  Handshake,
  PhoneIncoming,
  PhoneOutgoing,
  ShareNetwork,
  Storefront,
  UserCheck,
  type Icon,
} from "@phosphor-icons/react";
import { ArrowRight } from "@phosphor-icons/react";
import type { Locale } from "../../../i18n";
import type { CustomerNames, MoneyLine, OwnerRef, SourceKey } from "../../../api/marketing.ts";
import { Flag } from "../../components";
import type { GraphicTone } from "../../components";

export type Tone = GraphicTone;

const INTL: Record<Locale, string> = { zh: "zh-CN", th: "th-TH-u-ca-gregory", en: "en-GB" };

export const SOURCE_ICON: Record<SourceKey, Icon> = {
  exhibition: Storefront,
  referral: Handshake,
  website: Globe,
  line: ChatCircleDots,
  facebook: FacebookLogo,
  phone: PhoneIncoming,
  email: EnvelopeSimple,
  association: Buildings,
  social: ShareNetwork,
  cold_call: PhoneOutgoing,
  existing: UserCheck,
  other: DotsThreeCircle,
};

export function customerName(c: CustomerNames, locale: Locale): string {
  const pick = locale === "zh" ? c.nameZh : locale === "th" ? c.nameTh : c.nameEn;
  return pick || c.nameEn || c.nameTh || c.nameZh || c.id;
}

export function ownerName(o: OwnerRef, locale: Locale, fallback: string): string {
  if (o.key === "none" || !o.name) return fallback;
  if (locale === "zh") return o.nameZh || o.name;
  if (locale === "th") return o.nameTh || o.name;
  return o.name;
}

/** "฿1.4M" style short money for tiles and bars. */
export function fmtCompactMoney(value: number, currency: string, locale: Locale): string {
  try {
    return new Intl.NumberFormat(INTL[locale], { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString()}`;
  }
}

export function fmtPct(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
}

export function monthLabel(ym: string, locale: Locale): string {
  const d = new Date(`${ym}-01T00:00:00`);
  return new Intl.DateTimeFormat(INTL[locale], { month: "short" }).format(d);
}

/** Main currency first ("฿381K"), the rest as a short tail ("+ US$14.8K"). */
export function moneyLines(lines: MoneyLine[], locale: Locale): { main: string; rest: string } {
  if (!lines.length) return { main: "—", rest: "" };
  const [first, ...more] = lines;
  return {
    main: fmtCompactMoney(first!.value, first!.currency, locale),
    rest: more.map((m) => `+ ${fmtCompactMoney(m.value, m.currency, locale)}`).join(" "),
  };
}

export function LanePair({ pol, pod }: { pol: string; pod: string }) {
  return (
    <span className="mk-lane" aria-label={`${pol} → ${pod}`}>
      <Flag code={pol} size={16} />
      <span>{pol}</span>
      <ArrowRight size={11} aria-hidden />
      <Flag code={pod} size={16} />
      <span>{pod}</span>
    </span>
  );
}
