import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { Db } from "./index.js";
import { users } from "./schema/auth.js";
import { quotationCharges, quotationRevisions, quotations } from "./schema/commercial.js";
import { contacts, customers, leads, opportunities } from "./schema/crm.js";
import { jobs } from "./schema/operations.js";
import { DEMO_ORG_ID } from "../domain/tenancy.js";
import { nextDocNumber } from "../services/sequence.service.js";
import { bangkokDate } from "./seed-operations.js";

/**
 * Marketing analytics sample data: ~30 leads over the past 6 months across the sources a Thai
 * port / terminal sales team actually uses, 8 of them converted into customers (with contacts,
 * deals, quotations and a few jobs), and three customers that went quiet (> 90 days) so the
 * "customers to follow up" list has something in it.
 *
 * Stable ids (mk-*); dates are relative to today and refreshed on every run. Lead stages and deal
 * stages edited in the app are kept; quotations / jobs are refreshed in place.
 */

const STAFF = {
  zhou: { email: "sales@cangzhan.com", label: "周可" },
  chen: { email: "chen@cangzhan.com", label: "陈一宁" },
  lin: { email: "admin@cangzhan.com", label: "林晓衡" },
  pim: { email: "marketing@cangzhan.com", label: "พิมพ์ชนก รัตนกุล" },
} as const;
type Staff = keyof typeof STAFF;

type LeadSpec = {
  id: string;
  company: string;
  city: string;
  lane: string;
  contact: string;
  source: string;
  stage: "new" | "working" | "qualified" | "lost";
  teu: number;
  owner: Staff;
  /** Created N days ago. */
  ago: number;
};

const SRC = {
  fair: "งานแสดงสินค้า",
  ref: "แนะนำต่อ",
  web: "เว็บไซต์",
  line: "LINE OA",
  fb: "Facebook",
  call: "โทรเข้า",
} as const;

const LEADS: LeadSpec[] = [
  { id: "mk-l01", company: "สยามแพ็คเกจจิ้ง อินดัสทรี", city: "ชลบุรี", lane: "แหลมฉบัง → หนิงโป", contact: "คุณวรรณา", source: SRC.fair, stage: "qualified", teu: 18, owner: "zhou", ago: 172 },
  { id: "mk-l02", company: "ไทยอะกริ ฟู้ดส์", city: "นครปฐม", lane: "แหลมฉบัง → เซี่ยงไฮ้", contact: "คุณธีรพงษ์", source: SRC.ref, stage: "qualified", teu: 24, owner: "chen", ago: 165 },
  { id: "mk-l03", company: "อีสเทิร์น ออโต้พาร์ท", city: "ระยอง", lane: "เซี่ยงไฮ้ → แหลมฉบัง", contact: "คุณสมศักดิ์", source: SRC.fair, stage: "lost", teu: 10, owner: "zhou", ago: 160 },
  { id: "mk-l04", company: "บางกอก เฟอร์นิเจอร์ เทรด", city: "กรุงเทพฯ", lane: "หยานเถียน → กรุงเทพ", contact: "คุณพิไลพร", source: SRC.web, stage: "qualified", teu: 12, owner: "pim", ago: 150 },
  { id: "mk-l05", company: "โคราช ไรซ์ เอ็กซ์ปอร์ต", city: "นครราชสีมา", lane: "แหลมฉบัง → ชิงเต่า", contact: "คุณประยุทธ", source: SRC.call, stage: "lost", teu: 6, owner: "chen", ago: 142 },
  { id: "mk-l06", company: "ศรีราชา เคมีคอล", city: "ชลบุรี", lane: "ชิงเต่า → แหลมฉบัง", contact: "คุณอนุชา", source: SRC.ref, stage: "qualified", teu: 15, owner: "lin", ago: 136 },
  { id: "mk-l07", company: "เชียงใหม่ ครีเอทีฟ โฮม", city: "เชียงใหม่", lane: "เซินเจิ้น → แหลมฉบัง", contact: "คุณกมลชนก", source: SRC.fb, stage: "lost", teu: 4, owner: "pim", ago: 128 },
  { id: "mk-l08", company: "ไทยรับเบอร์ โปรดักส์", city: "สงขลา", lane: "สงขลา → หนิงโป", contact: "คุณสุชาติ", source: SRC.fair, stage: "qualified", teu: 20, owner: "zhou", ago: 121 },
  { id: "mk-l09", company: "พัทยา ซีฟู้ด", city: "ชลบุรี", lane: "แหลมฉบัง → ฮ่องกง", contact: "คุณนงลักษณ์", source: SRC.line, stage: "working", teu: 8, owner: "pim", ago: 115 },
  { id: "mk-l10", company: "เมกะ อิเล็กทรอนิกส์ (ไทยแลนด์)", city: "ปทุมธานี", lane: "หยานเถียน → แหลมฉบัง", contact: "Mr. David Lim", source: SRC.web, stage: "lost", teu: 14, owner: "chen", ago: 108 },
  { id: "mk-l11", company: "สมุทรสาคร โคลด์เชน", city: "สมุทรสาคร", lane: "แหลมฉบัง → หยานเถียน", contact: "คุณปรีดา", source: SRC.ref, stage: "qualified", teu: 22, owner: "lin", ago: 98 },
  { id: "mk-l12", company: "อยุธยา สตีล เวิร์คส์", city: "พระนครศรีอยุธยา", lane: "เทียนจิน → แหลมฉบัง", contact: "คุณวิโรจน์", source: SRC.fair, stage: "lost", teu: 9, owner: "zhou", ago: 92 },
  { id: "mk-l13", company: "กรีนลีฟ ออร์แกนิค", city: "เชียงราย", lane: "แหลมฉบัง → กว่างโจว", contact: "คุณศิริพร", source: SRC.fb, stage: "qualified", teu: 5, owner: "pim", ago: 84 },
  { id: "mk-l14", company: "ไทยเท็กซ์ไทล์ ยูไนเต็ด", city: "สมุทรปราการ", lane: "เซี่ยงไฮ้ → กรุงเทพ", contact: "คุณมานพ", source: SRC.call, stage: "working", teu: 11, owner: "chen", ago: 77 },
  { id: "mk-l15", company: "ภูเก็ต บิวดิ้ง ซัพพลาย", city: "ภูเก็ต", lane: "เซียะเหมิน → แหลมฉบัง", contact: "คุณจักรพันธ์", source: SRC.web, stage: "new", teu: 7, owner: "pim", ago: 70 },
  { id: "mk-l16", company: "แหลมทอง ฟรุ๊ต", city: "จันทบุรี", lane: "แหลมฉบัง → หนานซา", contact: "คุณรัตนา", source: SRC.line, stage: "qualified", teu: 30, owner: "lin", ago: 63 },
  { id: "mk-l17", company: "บูรพา พลาสติก", city: "ฉะเชิงเทรา", lane: "หนิงโป → แหลมฉบัง", contact: "คุณสุริยา", source: SRC.fair, stage: "working", teu: 13, owner: "zhou", ago: 57 },
  { id: "mk-l18", company: "สุวรรณภูมิ เมดิคอล", city: "สมุทรปราการ", lane: "เซินเจิ้น → กรุงเทพ", contact: "คุณอรอุมา", source: SRC.ref, stage: "working", teu: 6, owner: "chen", ago: 49 },
  { id: "mk-l19", company: "ไทยแลนด์ ทอยส์ เฮาส์", city: "กรุงเทพฯ", lane: "ซัวเถา → กรุงเทพ", contact: "คุณเกศินี", source: SRC.fb, stage: "lost", teu: 3, owner: "pim", ago: 44 },
  { id: "mk-l20", company: "อีสาน คาสซาวา", city: "ขอนแก่น", lane: "แหลมฉบัง → ชิงเต่า", contact: "คุณบุญชัย", source: SRC.call, stage: "qualified", teu: 16, owner: "zhou", ago: 38 },
  { id: "mk-l21", company: "เอเชีย ไทร์ เทรดดิ้ง", city: "ระยอง", lane: "ชิงเต่า → แหลมฉบัง", contact: "คุณวีรยุทธ", source: SRC.web, stage: "working", teu: 10, owner: "chen", ago: 31 },
  { id: "mk-l22", company: "ชลบุรี เมทัล ฟอร์มมิ่ง", city: "ชลบุรี", lane: "แหลมฉบัง → โฮจิมินห์", contact: "คุณภานุวัฒน์", source: SRC.fair, stage: "working", teu: 8, owner: "zhou", ago: 26 },
  { id: "mk-l23", company: "นครสวรรค์ ชูการ์", city: "นครสวรรค์", lane: "แหลมฉบัง → เซี่ยงไฮ้", contact: "คุณดารุณี", source: SRC.ref, stage: "qualified", teu: 40, owner: "lin", ago: 21 },
  { id: "mk-l24", company: "บิวตี้ คอสเมติกส์ ไทย", city: "นนทบุรี", lane: "กว่างโจว → กรุงเทพ", contact: "คุณชลธิชา", source: SRC.line, stage: "working", teu: 4, owner: "pim", ago: 17 },
  { id: "mk-l25", company: "สตาร์ โซลาร์ เอนเนอร์จี", city: "ปราจีนบุรี", lane: "หนิงโป → แหลมฉบัง", contact: "คุณกิตติศักดิ์", source: SRC.web, stage: "new", teu: 25, owner: "chen", ago: 13 },
  { id: "mk-l26", company: "แม่กลอง ซอลท์", city: "สมุทรสงคราม", lane: "แหลมฉบัง → ไฮฟอง", contact: "คุณสมหญิง", source: SRC.fb, stage: "new", teu: 3, owner: "pim", ago: 10 },
  { id: "mk-l27", company: "ไทยแลนด์ คอฟฟี่ โรสเตอร์", city: "เชียงราย", lane: "แหลมฉบัง → เซี่ยงไฮ้", contact: "คุณปิยะ", source: SRC.line, stage: "new", teu: 2, owner: "pim", ago: 7 },
  { id: "mk-l28", company: "เอ็มเอ็กซ์ มอเตอร์ พาร์ท", city: "ระยอง", lane: "เซี่ยงไฮ้ → แหลมฉบัง", contact: "คุณณัฐพล", source: SRC.fair, stage: "new", teu: 12, owner: "zhou", ago: 5 },
  { id: "mk-l29", company: "ไทยแลนด์ เปเปอร์ มิลล์", city: "ราชบุรี", lane: "แหลมฉบัง → หนิงโป", contact: "คุณวัชระ", source: SRC.ref, stage: "new", teu: 15, owner: "chen", ago: 3 },
  { id: "mk-l30", company: "โกลเด้น ฟิช ซอส", city: "ตราด", lane: "แหลมฉบัง → ฮ่องกง", contact: "คุณสุนันทา", source: SRC.call, stage: "new", teu: 5, owner: "pim", ago: 1 },
];

type CustomerSpec = {
  id: string;
  fromLead: string;
  nameTh: string;
  nameEn: string;
  nameZh: string;
  cityTh: string;
  cityEn: string;
  cityZh: string;
  pol: string;
  pod: string;
  laneTh: string;
  laneEn: string;
  laneZh: string;
  businessType: "importer" | "exporter" | "manufacturer" | "trading";
  industry: string;
  leadSource: "exhibition" | "referral" | "website" | "social" | "other";
  owner: Staff;
  ago: number;
  contacts: { name: string; title: string; email: string; phone: string; lineId?: string }[];
};

const CUSTOMERS: CustomerSpec[] = [
  {
    id: "mk-c01", fromLead: "mk-l01", nameTh: "สยามแพ็คเกจจิ้ง อินดัสทรี", nameEn: "Siam Packaging Industry", nameZh: "暹罗包装工业",
    cityTh: "ชลบุรี", cityEn: "Chonburi", cityZh: "春武里", pol: "THLCH", pod: "CNNGB", laneTh: "แหลมฉบัง → หนิงโป", laneEn: "Laem Chabang → Ningbo", laneZh: "林查班 → 宁波",
    businessType: "manufacturer", industry: "บรรจุภัณฑ์", leadSource: "exhibition", owner: "zhou", ago: 160,
    contacts: [
      { name: "วรรณา ศรีสุข", title: "Purchasing", email: "wanna@siampack.co.th", phone: "+66 38 192 441", lineId: "wanna.sp" },
      { name: "ชาตรี มั่นคง", title: "Logistics", email: "logistics@siampack.co.th", phone: "+66 38 192 450" },
    ],
  },
  {
    id: "mk-c02", fromLead: "mk-l02", nameTh: "ไทยอะกริ ฟู้ดส์", nameEn: "Thai Agri Foods", nameZh: "泰农食品",
    cityTh: "นครปฐม", cityEn: "Nakhon Pathom", cityZh: "佛统", pol: "THLCH", pod: "CNSHA", laneTh: "แหลมฉบัง → เซี่ยงไฮ้", laneEn: "Laem Chabang → Shanghai", laneZh: "林查班 → 上海",
    businessType: "exporter", industry: "อาหารแปรรูป", leadSource: "referral", owner: "chen", ago: 150,
    contacts: [{ name: "ธีรพงษ์ วงศ์ใหญ่", title: "Export manager", email: "teerapong@thaiagrifoods.com", phone: "+66 34 251 778", lineId: "teerapong.taf" }],
  },
  {
    id: "mk-c03", fromLead: "mk-l04", nameTh: "บางกอก เฟอร์นิเจอร์ เทรด", nameEn: "Bangkok Furniture Trade", nameZh: "曼谷家具贸易",
    cityTh: "กรุงเทพฯ", cityEn: "Bangkok", cityZh: "曼谷", pol: "CNYTN", pod: "THBKK", laneTh: "หยานเถียน → กรุงเทพ", laneEn: "Yantian → Bangkok", laneZh: "盐田 → 曼谷",
    businessType: "importer", industry: "เฟอร์นิเจอร์", leadSource: "website", owner: "pim", ago: 138,
    contacts: [{ name: "พิไลพร จันทร์หอม", title: "Owner", email: "pilaiporn@bkkfurniture.co.th", phone: "+66 2 381 2290", lineId: "pilai.bft" }],
  },
  {
    id: "mk-c04", fromLead: "mk-l06", nameTh: "ศรีราชา เคมีคอล", nameEn: "Sriracha Chemical", nameZh: "是拉差化工",
    cityTh: "ชลบุรี", cityEn: "Chonburi", cityZh: "春武里", pol: "CNTAO", pod: "THLCH", laneTh: "ชิงเต่า → แหลมฉบัง", laneEn: "Qingdao → Laem Chabang", laneZh: "青岛 → 林查班",
    businessType: "importer", industry: "เคมีภัณฑ์", leadSource: "referral", owner: "lin", ago: 125,
    contacts: [{ name: "อนุชา แก้วประเสริฐ", title: "Supply chain", email: "anucha@srirachachem.com", phone: "+66 38 771 305" }],
  },
  {
    id: "mk-c05", fromLead: "mk-l08", nameTh: "ไทยรับเบอร์ โปรดักส์", nameEn: "Thai Rubber Products", nameZh: "泰国橡胶制品",
    cityTh: "สงขลา", cityEn: "Songkhla", cityZh: "宋卡", pol: "THSGZ", pod: "CNNGB", laneTh: "สงขลา → หนิงโป", laneEn: "Songkhla → Ningbo", laneZh: "宋卡 → 宁波",
    businessType: "exporter", industry: "ยางพารา", leadSource: "exhibition", owner: "zhou", ago: 110,
    contacts: [{ name: "สุชาติ ทองดี", title: "Managing director", email: "suchart@thairubberproducts.com", phone: "+66 74 312 908", lineId: "suchart.trp" }],
  },
  {
    id: "mk-c06", fromLead: "mk-l11", nameTh: "สมุทรสาคร โคลด์เชน", nameEn: "Samut Sakhon Cold Chain", nameZh: "龙仔厝冷链",
    cityTh: "สมุทรสาคร", cityEn: "Samut Sakhon", cityZh: "龙仔厝", pol: "THLCH", pod: "CNYTN", laneTh: "แหลมฉบัง → หยานเถียน", laneEn: "Laem Chabang → Yantian", laneZh: "林查班 → 盐田",
    businessType: "exporter", industry: "อาหารทะเลแช่แข็ง", leadSource: "referral", owner: "lin", ago: 172,
    contacts: [{ name: "ปรีดา สายทอง", title: "Shipping", email: "preeda@sscoldchain.co.th", phone: "+66 34 822 116" }],
  },
  {
    id: "mk-c07", fromLead: "mk-l13", nameTh: "กรีนลีฟ ออร์แกนิค", nameEn: "Greenleaf Organic", nameZh: "绿叶有机",
    cityTh: "เชียงราย", cityEn: "Chiang Rai", cityZh: "清莱", pol: "THLCH", pod: "CNCAN", laneTh: "แหลมฉบัง → กว่างโจว", laneEn: "Laem Chabang → Guangzhou", laneZh: "林查班 → 广州",
    businessType: "trading", industry: "เกษตรอินทรีย์", leadSource: "social", owner: "pim", ago: 168,
    contacts: [{ name: "ศิริพร คำแก้ว", title: "Owner", email: "siriporn@greenleaf-organic.com", phone: "+66 53 711 409", lineId: "greenleaf.cr" }],
  },
  {
    id: "mk-c08", fromLead: "mk-l16", nameTh: "แหลมทอง ฟรุ๊ต", nameEn: "Laem Thong Fruit", nameZh: "金岬水果",
    cityTh: "จันทบุรี", cityEn: "Chanthaburi", cityZh: "尖竹汶", pol: "THLCH", pod: "CNNSA", laneTh: "แหลมฉบัง → หนานซา", laneEn: "Laem Chabang → Nansha", laneZh: "林查班 → 南沙",
    businessType: "exporter", industry: "ผลไม้สด", leadSource: "social", owner: "lin", ago: 52,
    contacts: [
      { name: "รัตนา พูลสวัสดิ์", title: "Export", email: "rattana@laemthongfruit.com", phone: "+66 39 301 552", lineId: "rattana.ltf" },
      { name: "ก้องภพ พูลสวัสดิ์", title: "Director", email: "kongphop@laemthongfruit.com", phone: "+66 81 455 2093" },
    ],
  },
];

type QuoteSpec = {
  id: string;
  customerId: string;
  status: "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "DRAFT";
  ago: number;
  pol: string;
  pod: string;
  origin: string;
  destination: string;
  containerType: string;
  quantity: number;
  currency: "USD" | "THB";
  buy: number;
  sell: number;
  commodity: string;
  owner: Staff;
  /** Days from creation to decision (accepted / rejected). */
  decideIn?: number;
  job?: { id: string; status: "DELIVERED" | "SAIL" | "BOOKING"; etd: number; eta: number; carrier: string };
};

const QUOTES: QuoteSpec[] = [
  { id: "mk-q01", customerId: "mk-c06", status: "ACCEPTED", ago: 150, pol: "THLCH", pod: "CNYTN", origin: "Laem Chabang", destination: "Yantian", containerType: "40RF", quantity: 4, currency: "USD", buy: 1650, sell: 2080, commodity: "Frozen seafood", owner: "lin", decideIn: 5, job: { id: "mk-j01", status: "DELIVERED", etd: -138, eta: -131, carrier: "ONE" } },
  { id: "mk-q02", customerId: "mk-c01", status: "ACCEPTED", ago: 145, pol: "THLCH", pod: "CNNGB", origin: "Laem Chabang", destination: "Ningbo", containerType: "40HC", quantity: 3, currency: "USD", buy: 610, sell: 790, commodity: "Packaging film", owner: "zhou", decideIn: 4, job: { id: "mk-j02", status: "DELIVERED", etd: -132, eta: -124, carrier: "Evergreen" } },
  { id: "mk-q03", customerId: "mk-c07", status: "EXPIRED", ago: 140, pol: "THLCH", pod: "CNCAN", origin: "Laem Chabang", destination: "Guangzhou", containerType: "20GP", quantity: 1, currency: "THB", buy: 16500, sell: 21000, commodity: "Organic rice", owner: "pim" },
  { id: "mk-q04", customerId: "mk-c02", status: "ACCEPTED", ago: 128, pol: "THLCH", pod: "CNSHA", origin: "Laem Chabang", destination: "Shanghai", containerType: "40HC", quantity: 5, currency: "USD", buy: 540, sell: 720, commodity: "Canned food", owner: "chen", decideIn: 6, job: { id: "mk-j03", status: "DELIVERED", etd: -115, eta: -108, carrier: "COSCO" } },
  { id: "mk-q05", customerId: "mk-c03", status: "REJECTED", ago: 120, pol: "CNYTN", pod: "THBKK", origin: "Yantian", destination: "Bangkok", containerType: "40HC", quantity: 2, currency: "USD", buy: 820, sell: 1080, commodity: "Furniture", owner: "pim", decideIn: 8 },
  { id: "mk-q06", customerId: "mk-c04", status: "ACCEPTED", ago: 112, pol: "CNTAO", pod: "THLCH", origin: "Qingdao", destination: "Laem Chabang", containerType: "20GP", quantity: 4, currency: "USD", buy: 630, sell: 830, commodity: "Industrial chemicals", owner: "lin", decideIn: 3, job: { id: "mk-j04", status: "DELIVERED", etd: -100, eta: -92, carrier: "PIL" } },
  { id: "mk-q07", customerId: "mk-c05", status: "EXPIRED", ago: 98, pol: "THSGZ", pod: "CNNGB", origin: "Songkhla", destination: "Ningbo", containerType: "20GP", quantity: 6, currency: "THB", buy: 15800, sell: 19900, commodity: "Natural rubber", owner: "zhou" },
  { id: "mk-q08", customerId: "mk-c03", status: "ACCEPTED", ago: 75, pol: "CNYTN", pod: "THBKK", origin: "Yantian", destination: "Bangkok", containerType: "40HC", quantity: 2, currency: "USD", buy: 800, sell: 1020, commodity: "Furniture", owner: "pim", decideIn: 2, job: { id: "mk-j05", status: "DELIVERED", etd: -62, eta: -55, carrier: "MSC" } },
  { id: "mk-q09", customerId: "mk-c05", status: "ACCEPTED", ago: 66, pol: "THSGZ", pod: "CNNGB", origin: "Songkhla", destination: "Ningbo", containerType: "20GP", quantity: 6, currency: "THB", buy: 15600, sell: 19400, commodity: "Natural rubber", owner: "zhou", decideIn: 5, job: { id: "mk-j06", status: "DELIVERED", etd: -52, eta: -44, carrier: "Wan Hai" } },
  { id: "mk-q10", customerId: "mk-c08", status: "ACCEPTED", ago: 40, pol: "THLCH", pod: "CNNSA", origin: "Laem Chabang", destination: "Nansha", containerType: "40RF", quantity: 6, currency: "USD", buy: 1580, sell: 1990, commodity: "Fresh durian", owner: "lin", decideIn: 3, job: { id: "mk-j07", status: "DELIVERED", etd: -30, eta: -25, carrier: "SITC" } },
  { id: "mk-q11", customerId: "mk-c02", status: "ACCEPTED", ago: 24, pol: "THLCH", pod: "CNSHA", origin: "Laem Chabang", destination: "Shanghai", containerType: "40HC", quantity: 4, currency: "USD", buy: 560, sell: 735, commodity: "Canned food", owner: "chen", decideIn: 4, job: { id: "mk-j08", status: "SAIL", etd: -6, eta: 2, carrier: "COSCO" } },
  { id: "mk-q12", customerId: "mk-c01", status: "SENT", ago: 9, pol: "THLCH", pod: "CNNGB", origin: "Laem Chabang", destination: "Ningbo", containerType: "40HC", quantity: 4, currency: "USD", buy: 600, sell: 780, commodity: "Packaging film", owner: "zhou" },
  { id: "mk-q13", customerId: "mk-c08", status: "SENT", ago: 5, pol: "THLCH", pod: "CNNSA", origin: "Laem Chabang", destination: "Nansha", containerType: "40RF", quantity: 8, currency: "USD", buy: 1560, sell: 1960, commodity: "Fresh mangosteen", owner: "lin" },
  { id: "mk-q14", customerId: "mk-c04", status: "EXPIRED", ago: 120, pol: "CNTAO", pod: "THLCH", origin: "Qingdao", destination: "Laem Chabang", containerType: "20GP", quantity: 2, currency: "USD", buy: 640, sell: 860, commodity: "Industrial chemicals", owner: "lin" },
  { id: "mk-q15", customerId: "mk-c03", status: "SENT", ago: 3, pol: "CNYTN", pod: "THBKK", origin: "Yantian", destination: "Bangkok", containerType: "40HC", quantity: 3, currency: "USD", buy: 790, sell: 1010, commodity: "Furniture", owner: "pim" },
];

type DealSpec = { id: string; customerId: string; title: string; lane: string; stage: "qualify" | "quote" | "won" | "book" | "billed"; value: number; teu: number; closeIn: number; owner: Staff; ago: number };

const DEALS: DealSpec[] = [
  { id: "mk-d01", customerId: "mk-c01", title: "ฟิล์มบรรจุภัณฑ์ 4×40HC หนิงโป", lane: "แหลมฉบัง → หนิงโป", stage: "quote", value: 106000, teu: 8, closeIn: 12, owner: "zhou", ago: 10 },
  { id: "mk-d02", customerId: "mk-c08", title: "ทุเรียนสด ฤดูกาล 8×40RF", lane: "แหลมฉบัง → หนานซา", stage: "quote", value: 540000, teu: 16, closeIn: 9, owner: "lin", ago: 6 },
  { id: "mk-d03", customerId: "mk-c03", title: "เฟอร์นิเจอร์ไตรมาส 4", lane: "หยานเถียน → กรุงเทพ", stage: "qualify", value: 98000, teu: 6, closeIn: 25, owner: "pim", ago: 4 },
  { id: "mk-d04", customerId: "mk-c02", title: "อาหารกระป๋อง สัญญารายเดือน", lane: "แหลมฉบัง → เซี่ยงไฮ้", stage: "book", value: 102000, teu: 8, closeIn: -20, owner: "chen", ago: 26 },
  { id: "mk-d05", customerId: "mk-c05", title: "ยางแผ่นรมควัน ปี 2027", lane: "สงขลา → หนิงโป", stage: "qualify", value: 240000, teu: 24, closeIn: 40, owner: "zhou", ago: 14 },
  { id: "mk-d06", customerId: "mk-c04", title: "เคมีภัณฑ์ นำเข้ารายไตรมาส", lane: "ชิงเต่า → แหลมฉบัง", stage: "won", value: 118000, teu: 8, closeIn: -90, owner: "lin", ago: 115 },
];

/** Business type / industry for the original demo customers (only filled when empty). */
const PROFILE_FILL: Record<string, { businessType: string; industry: string }> = {
  c1: { businessType: "importer", industry: "เฟอร์นิเจอร์" },
  c2: { businessType: "importer", industry: "เม็ดพลาสติก" },
  c3: { businessType: "importer", industry: "เคมีภัณฑ์" },
  c4: { businessType: "importer", industry: "เครื่องจักร" },
  c5: { businessType: "trading", industry: "สินค้าอุปโภค" },
  c6: { businessType: "importer", industry: "อิเล็กทรอนิกส์" },
  c7: { businessType: "trading", industry: "สิ่งทอ" },
  c8: { businessType: "trading", industry: "ตู้เปล่า" },
  c9: { businessType: "exporter", industry: "อาหารแช่แข็ง" },
  c10: { businessType: "exporter", industry: "ยางพารา" },
};

const mmdd = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export async function seedMarketing(db: Db, now = new Date()) {
  const at = (daysAgo: number, hour = 10) => new Date(`${bangkokDate(now, -daysAgo)}T${String(hour).padStart(2, "0")}:00:00+07:00`);
  const staffRows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.email, Object.values(STAFF).map((s) => s.email)));
  const staffId = (k: Staff) => staffRows.find((r) => r.email === STAFF[k].email)?.id ?? null;
  // The marketing user may not exist yet on an old database — fall back to the admin.
  const ownerOf = (k: Staff) => (staffId(k) ? k : "lin");

  // Leads: insert missing; dates are re-anchored to today, stages edited in the app are kept.
  for (const l of LEADS) {
    const o = ownerOf(l.owner);
    const createdAt = at(l.ago, 9 + (l.ago % 8));
    const row = {
      organizationId: DEMO_ORG_ID,
      company: l.company,
      city: l.city,
      lane: l.lane,
      contact: l.contact,
      source: l.source,
      stage: l.stage,
      teu: l.teu,
      owner: STAFF[o].label,
      ownerUserId: staffId(o),
      updated: mmdd(at(Math.max(0, l.ago - 3))),
      createdAt,
      updatedAt: createdAt,
    };
    await db.insert(leads).values({ id: l.id, ...row }).onConflictDoUpdate({ target: leads.id, set: { createdAt: row.createdAt, updated: row.updated } });
  }

  // Customers converted from leads (+ contacts).
  for (const c of CUSTOMERS) {
    const o = ownerOf(c.owner);
    const createdAt = at(c.ago, 14);
    const row = {
      organizationId: DEMO_ORG_ID,
      nameZh: c.nameZh,
      nameTh: c.nameTh,
      nameEn: c.nameEn,
      nameLangs: "th,en",
      cityZh: c.cityZh,
      cityTh: c.cityTh,
      cityEn: c.cityEn,
      laneZh: c.laneZh,
      laneTh: c.laneTh,
      laneEn: c.laneEn,
      owner: STAFF[o].label,
      ownerUserId: staffId(o),
      updated: mmdd(createdAt),
      businessType: c.businessType,
      industry: c.industry,
      leadSource: c.leadSource,
      status: "active",
      country: "TH",
      currency: "USD",
      preferredLanes: [{ pol: c.pol, pod: c.pod }],
      createdAt,
    };
    await db.insert(customers).values({ id: c.id, ...row }).onConflictDoUpdate({ target: customers.id, set: { createdAt } });
    for (const [i, p] of c.contacts.entries()) {
      await db
        .insert(contacts)
        .values({ id: `${c.id}-p${i + 1}`, customerId: c.id, name: p.name, title: p.title, email: p.email, phone: p.phone, lineId: p.lineId ?? "", primary: i === 0, createdAt })
        .onConflictDoNothing();
    }
  }

  // Quotations (refreshed in place; number kept), with one revision + ocean-freight charge, and jobs for some accepted ones.
  const existing = await db.select({ id: quotations.id, n: quotations.quotationNumber }).from(quotations).where(inArray(quotations.id, QUOTES.map((q) => q.id)));
  const numberById = new Map(existing.map((r) => [r.id, r.n]));
  const existingJobs = await db.select({ id: jobs.id, n: jobs.jobNumber }).from(jobs).where(inArray(jobs.id, QUOTES.flatMap((q) => (q.job ? [q.job.id] : []))));
  const jobNumberById = new Map(existingJobs.map((r) => [r.id, r.n]));
  let jobCount = 0;
  for (const q of QUOTES) {
    const o = ownerOf(q.owner);
    const sales = staffId(o);
    const created = at(q.ago, 9);
    const sent = q.status !== "DRAFT";
    const decided = q.decideIn !== undefined ? at(Math.max(0, q.ago - q.decideIn), 15) : null;
    const values = {
      organizationId: DEMO_ORG_ID,
      quotationNumber: numberById.get(q.id) ?? (await nextDocNumber(db, "QT", "QT")),
      customerId: q.customerId,
      contactId: `${q.customerId}-p1`,
      mode: "SEA_FCL",
      serviceType: "PORT_TO_PORT",
      origin: q.origin,
      destination: q.destination,
      pol: q.pol,
      pod: q.pod,
      incoterm: "FOB",
      commodity: q.commodity,
      containerType: q.containerType,
      quantity: q.quantity,
      currency: q.currency,
      validFrom: created,
      validUntil: at(q.ago - 14, 23),
      paymentTermsDays: 30,
      salesOwnerId: sales,
      status: q.status,
      currentRevision: 0,
      sentAt: sent ? at(Math.max(0, q.ago - 1), 11) : null,
      sentBy: sent ? sales : null,
      updatedAt: decided ?? (q.status === "EXPIRED" ? at(q.ago - 14, 23) : at(Math.max(0, q.ago - 1), 11)),
    };
    await db.insert(quotations).values({ id: q.id, ...values, createdAt: created }).onConflictDoUpdate({ target: quotations.id, set: values });

    const buyAmount = (q.buy * q.quantity).toFixed(4);
    const sellAmount = (q.sell * q.quantity).toFixed(4);
    const margin = ((q.sell - q.buy) * q.quantity).toFixed(4);
    const marginPct = (((q.sell - q.buy) / q.sell) * 100).toFixed(4);
    const snapshot = {
      charges: [{ chargeCode: "OCEAN_FREIGHT", description: "Ocean freight", quantity: String(q.quantity), unit: "PER_CONTAINER", buyRate: String(q.buy), sellRate: String(q.sell), currency: q.currency }],
      totalBuy: buyAmount,
      totalSell: sellAmount,
      grossProfit: margin,
      marginPct,
    };
    const revId = `${q.id}-r0`;
    const rev = {
      quotationId: q.id,
      revisionNumber: 0,
      snapshot: JSON.stringify(snapshot),
      documentHash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
      reason: "Initial draft",
      immutable: sent,
      createdBy: sales ?? "system",
    };
    await db.insert(quotationRevisions).values({ id: revId, ...rev, createdAt: created }).onConflictDoUpdate({ target: quotationRevisions.id, set: rev });
    const charge = {
      revisionId: revId,
      chargeCode: "OCEAN_FREIGHT",
      description: "Ocean freight",
      quantity: String(q.quantity),
      unit: "PER_CONTAINER",
      buyRate: String(q.buy),
      sellRate: String(q.sell),
      currency: q.currency,
      exchangeRate: "1",
      buyAmount,
      sellAmount,
      margin,
      marginPercentage: marginPct,
    };
    await db.insert(quotationCharges).values({ id: `${revId}-c0`, ...charge }).onConflictDoUpdate({ target: quotationCharges.id, set: charge });

    if (q.job && decided) {
      const j = q.job;
      const teuPer = q.containerType.startsWith("20") ? 1 : 2;
      const job = {
        organizationId: DEMO_ORG_ID,
        jobNumber: jobNumberById.get(j.id) ?? (await nextDocNumber(db, "JOB", "JOB")),
        customerId: q.customerId,
        quotationId: q.id,
        quotationRevisionId: revId,
        direction: q.pol.startsWith("TH") ? "EXPORT" : "IMPORT",
        mode: "SEA_FCL",
        serviceType: "PORT_TO_PORT",
        incoterm: "FOB",
        origin: q.origin,
        destination: q.destination,
        pol: q.pol,
        pod: q.pod,
        carrier: j.carrier,
        etd: bangkokDate(now, j.etd),
        eta: bangkokDate(now, j.eta),
        commodity: q.commodity,
        containerType: q.containerType,
        containerCount: q.quantity,
        teu: q.quantity * teuPer,
        salesOwnerId: sales,
        status: j.status,
        currency: q.currency,
        updatedAt: at(Math.max(0, -j.eta), 16),
      };
      await db.insert(jobs).values({ id: j.id, ...job, createdAt: at(Math.max(0, q.ago - (q.decideIn ?? 0) - 1), 10) }).onConflictDoUpdate({ target: jobs.id, set: { ...job, createdAt: at(Math.max(0, q.ago - (q.decideIn ?? 0) - 1), 10) } });
      jobCount++;
    }
  }

  // Deals: close dates relative to today; stages edited in the app are kept.
  for (const d of DEALS) {
    const o = ownerOf(d.owner);
    const createdAt = at(d.ago, 10);
    await db
      .insert(opportunities)
      .values({ id: d.id, customerId: d.customerId, title: d.title, lane: d.lane, stage: d.stage, value: d.value, teu: d.teu, close: mmdd(at(-d.closeIn)), owner: STAFF[o].label, ownerUserId: staffId(o), currency: "THB", createdAt })
      .onConflictDoUpdate({ target: opportunities.id, set: { close: mmdd(at(-d.closeIn)), createdAt } });
  }

  // Segment chips need business type / industry on the original demo customers.
  for (const [id, p] of Object.entries(PROFILE_FILL)) {
    await db
      .update(customers)
      .set({ businessType: p.businessType })
      .where(and(eq(customers.id, id), or(isNull(customers.businessType), eq(customers.businessType, ""))));
    await db
      .update(customers)
      .set({ industry: p.industry })
      .where(and(eq(customers.id, id), or(isNull(customers.industry), eq(customers.industry, ""))));
  }

  return { leads: LEADS.length, customers: CUSTOMERS.length, quotations: QUOTES.length, jobs: jobCount, deals: DEALS.length };
}
