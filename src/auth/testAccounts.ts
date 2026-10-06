import type { Icon } from "@phosphor-icons/react";
import { Calculator, Crown, Headset, Megaphone, Package, Storefront } from "@phosphor-icons/react";

/**
 * One-click sign-in buttons for trying each role (real accounts, real API).
 * Hide them for real use with VITE_TEST_ACCOUNTS=false.
 */
export const testAccountsEnabled = import.meta.env.VITE_TEST_ACCOUNTS !== "false";

export const TEST_PASSWORD = "demo123";

export type TestAccount = {
  role: string;
  email: string;
  name: { zh: string; th: string; en: string };
  icon: Icon;
  tone: "primary" | "accent" | "success" | "warning" | "info";
};

export const TEST_ACCOUNTS: TestAccount[] = [
  { role: "admin", email: "admin@cangzhan.com", name: { zh: "林晓衡", th: "หลิน เสี่ยวเหิง", en: "Lin Xiaoheng" }, icon: Crown, tone: "accent" },
  { role: "sales", email: "sales@cangzhan.com", name: { zh: "周可", th: "โจว เข่อ", en: "Zhou Ke" }, icon: Storefront, tone: "primary" },
  { role: "ops", email: "ops@cangzhan.com", name: { zh: "马思远", th: "หม่า ซือหยวน", en: "Ma Siyuan" }, icon: Package, tone: "info" },
  { role: "cs", email: "cs@cangzhan.com", name: { zh: "纳帕·西苏", th: "ณภัทร ศรีสุข", en: "Napat Srisuk" }, icon: Headset, tone: "success" },
  { role: "finance", email: "finance@cangzhan.com", name: { zh: "诗丽蓬·旺萨功", th: "ศิริพร วงศ์สกุล", en: "Siriporn Wongsakul" }, icon: Calculator, tone: "warning" },
  { role: "marketing", email: "marketing@cangzhan.com", name: { zh: "宾查诺·叻达纳功", th: "พิมพ์ชนก รัตนกุล", en: "Pimchanok Rattanakul" }, icon: Megaphone, tone: "info" },
];

/** Test customer for the portal (code seeded by server/db/seed.ts). */
export const TEST_PORTAL = { email: "hai@huayun-sz.cn", code: "TEST-2026" };
