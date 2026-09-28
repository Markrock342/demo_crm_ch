import { inArray, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { users } from "../db/schema/auth.js";
import { containers, jobMilestones, jobs, shipmentCharges } from "../db/schema/operations.js";
import { jobTasks } from "../db/schema/job-tasks.js";
import { DEFAULT_MILESTONES } from "../services/milestone.service.js";
import { DEMO_ORG_ID } from "../domain/tenancy.js";
import { nextDocNumber } from "../services/sequence.service.js";
import { syncDocSequences } from "./seed-sequences.js";

/**
 * Demo operations data. Dates are offsets in days from "today" so the dashboard
 * (departing / arriving within 7 days, delayed jobs, transit bars) always has
 * something realistic to show. Re-running the seed refreshes these rows in place
 * (upsert by id) and never touches jobs/containers created by users.
 *
 * Yard locations are neutral codes (e.g. "LCB-B1"); the client translates them
 * with src/v2/lib/places.ts.
 */

type DemoJob = {
  id: string;
  /** Fixed number for the original demo jobs; newer demo jobs take the next number from doc_sequences on first insert. */
  jobNumber?: string;
  customerId: string;
  origin: string;
  destination: string;
  pol: string;
  pod: string;
  direction: "EXPORT" | "IMPORT";
  status: "BOOKING" | "GATE_IN" | "SAIL" | "ARRIVED" | "DELIVERED";
  /** ARRIVED jobs only: customs already cleared, waiting for delivery. */
  cleared?: boolean;
  teu: number;
  containerType: string;
  etd: number;
  eta: number;
  carrier: string;
  vessel: string;
  voyage: string;
  commodity: string;
  incoterm: string;
  sales: string;
  ops: string;
  currency: string;
  /** Revenue / cost per container (seed charges for GP). */
  sell: number;
  buy: number;
};

const DEMO_JOBS: DemoJob[] = [
  // Departing within 7 days
  { id: "s1", jobNumber: "JOB-2026-000001", customerId: "c4", origin: "Nansha", destination: "Laem Chabang", pol: "CNNSA", pod: "THLCH", direction: "IMPORT", status: "GATE_IN", teu: 3, containerType: "40HC", etd: 2, eta: 8, carrier: "COSCO", vessel: "COSCO SHIPPING ARIES", voyage: "118S", commodity: "Machinery parts", incoterm: "FOB", sales: "sales@cangzhan.com", ops: "ops@cangzhan.com", currency: "USD", sell: 1180, buy: 905 },
  { id: "s5", jobNumber: "JOB-2026-000004", customerId: "c5", origin: "Ningbo", destination: "Bangkok", pol: "CNNGB", pod: "THBKK", direction: "IMPORT", status: "BOOKING", teu: 3, containerType: "40HC", etd: 5, eta: 13, carrier: "CMA CGM", vessel: "CMA CGM THALASSA", voyage: "0TX3AS1", commodity: "General merchandise", incoterm: "FOB", sales: "chen@cangzhan.com", ops: "ops@cangzhan.com", currency: "USD", sell: 1050, buy: 830 },
  { id: "s9", jobNumber: "JOB-2026-000009", customerId: "c10", origin: "Laem Chabang", destination: "Ningbo", pol: "THLCH", pod: "CNNGB", direction: "EXPORT", status: "GATE_IN", teu: 2, containerType: "20GP", etd: 1, eta: 9, carrier: "Evergreen", vessel: "EVER BLISS", voyage: "1123N", commodity: "Natural rubber", incoterm: "CIF", sales: "chen@cangzhan.com", ops: "cs@cangzhan.com", currency: "USD", sell: 690, buy: 520 },
  // In transit, arriving within 7 days
  { id: "s2", jobNumber: "JOB-2026-000002", customerId: "c9", origin: "Laem Chabang", destination: "Yantian", pol: "THLCH", pod: "CNYTN", direction: "EXPORT", status: "SAIL", teu: 4, containerType: "40RF", etd: -4, eta: 2, carrier: "ONE", vessel: "ONE COMMITMENT", voyage: "052N", commodity: "Frozen food", incoterm: "CIF", sales: "admin@cangzhan.com", ops: "cs@cangzhan.com", currency: "USD", sell: 2150, buy: 1720 },
  { id: "s7", jobNumber: "JOB-2026-000007", customerId: "c2", origin: "Ningbo", destination: "Bangkok", pol: "CNNGB", pod: "THBKK", direction: "IMPORT", status: "SAIL", teu: 2, containerType: "40HC", etd: -6, eta: 1, carrier: "OOCL", vessel: "OOCL BANGKOK", voyage: "071S", commodity: "Plastic resin", incoterm: "FOB", sales: "admin@cangzhan.com", ops: "ops@cangzhan.com", currency: "USD", sell: 1120, buy: 870 },
  { id: "s8", jobNumber: "JOB-2026-000008", customerId: "c6", origin: "Humen", destination: "Rayong", pol: "CNHMN", pod: "THLCH", direction: "IMPORT", status: "SAIL", teu: 2, containerType: "40HC", etd: -3, eta: 5, carrier: "SITC", vessel: "SITC HAIPHONG", voyage: "2537S", commodity: "Electronics", incoterm: "EXW", sales: "chen@cangzhan.com", ops: "ops@cangzhan.com", currency: "USD", sell: 1240, buy: 960 },
  // Delayed: ETA passed but the vessel has not arrived yet
  { id: "s3", jobNumber: "JOB-2026-000003", customerId: "c1", origin: "Yantian", destination: "Laem Chabang", pol: "CNYTN", pod: "THLCH", direction: "IMPORT", status: "SAIL", teu: 4, containerType: "40HC", etd: -9, eta: -2, carrier: "MSC", vessel: "MSC LONDON", voyage: "FA538W", commodity: "Furniture", incoterm: "FOB", sales: "sales@cangzhan.com", ops: "ops@cangzhan.com", currency: "USD", sell: 1090, buy: 850 },
  { id: "s10", jobNumber: "JOB-2026-000010", customerId: "c7", origin: "Shanghai", destination: "Bangkok", pol: "CNSHA", pod: "THBKK", direction: "IMPORT", status: "SAIL", teu: 1, containerType: "20GP", etd: -10, eta: -3, carrier: "Wan Hai", vessel: "WAN HAI 302", voyage: "N215", commodity: "Cotton yarn", incoterm: "CFR", sales: "admin@cangzhan.com", ops: "cs@cangzhan.com", currency: "USD", sell: 760, buy: 590 },
  // Arrived, waiting on customs
  { id: "s6", jobNumber: "JOB-2026-000005", customerId: "c3", origin: "Qingdao", destination: "Laem Chabang", pol: "CNTAO", pod: "THLCH", direction: "IMPORT", status: "ARRIVED", teu: 1, containerType: "20GP", etd: -12, eta: -3, carrier: "PIL", vessel: "PIL BANGKOK", voyage: "2519S", commodity: "Chemicals (non-hazardous)", incoterm: "CIF", sales: "ops@cangzhan.com", ops: "ops@cangzhan.com", currency: "USD", sell: 820, buy: 640 },
  // Delivered
  { id: "s11", jobNumber: "JOB-2026-000011", customerId: "c8", origin: "Laem Chabang", destination: "Yantian", pol: "THLCH", pod: "CNYTN", direction: "EXPORT", status: "DELIVERED", teu: 2, containerType: "40HC", etd: -26, eta: -19, carrier: "Yang Ming", vessel: "YM WELLNESS", voyage: "083N", commodity: "Empty repositioning", incoterm: "FOB", sales: "ops@cangzhan.com", ops: "cs@cangzhan.com", currency: "THB", sell: 18500, buy: 14200 },
  // Booked for later
  { id: "s12", jobNumber: "JOB-2026-000012", customerId: "c9", origin: "Laem Chabang", destination: "Yantian", pol: "THLCH", pod: "CNYTN", direction: "EXPORT", status: "BOOKING", teu: 4, containerType: "40RF", etd: 10, eta: 16, carrier: "ONE", vessel: "ONE CONTRIBUTION", voyage: "054N", commodity: "Frozen food", incoterm: "CIF", sales: "admin@cangzhan.com", ops: "cs@cangzhan.com", currency: "USD", sell: 2150, buy: 1720 },
  { id: "s13", customerId: "c2", origin: "Shanghai", destination: "Laem Chabang", pol: "CNSHA", pod: "THLCH", direction: "IMPORT", status: "BOOKING", teu: 4, containerType: "40HC", etd: 12, eta: 19, carrier: "MSC", vessel: "MSC ARINA", voyage: "FL613S", commodity: "Auto parts", incoterm: "FOB", sales: "chen@cangzhan.com", ops: "ops@cangzhan.com", currency: "USD", sell: 1010, buy: 790 },
  // Gate-in / sailed
  { id: "s14", customerId: "c6", origin: "Laem Chabang", destination: "Shekou", pol: "THLCH", pod: "CNSHK", direction: "EXPORT", status: "GATE_IN", teu: 2, containerType: "20GP", etd: 2, eta: 9, carrier: "Evergreen", vessel: "EVER CONNECT", voyage: "0612N", commodity: "Canned fruit", incoterm: "FOB", sales: "sales@cangzhan.com", ops: "cs@cangzhan.com", currency: "THB", sell: 21500, buy: 17200 },
  { id: "s15", customerId: "c5", origin: "Xiamen", destination: "Bangkok", pol: "CNXMN", pod: "THBKK", direction: "IMPORT", status: "SAIL", teu: 2, containerType: "40HC", etd: -2, eta: 5, carrier: "SITC", vessel: "SITC XIAMEN", voyage: "2539S", commodity: "Ceramic tiles", incoterm: "FOB", sales: "chen@cangzhan.com", ops: "ops@cangzhan.com", currency: "USD", sell: 980, buy: 760 },
  // Arrived (customs pending) / customs cleared, waiting for delivery
  { id: "s16", customerId: "c4", origin: "Nansha", destination: "Laem Chabang", pol: "CNNSA", pod: "THLCH", direction: "IMPORT", status: "ARRIVED", teu: 4, containerType: "40HC", etd: -9, eta: -1, carrier: "COSCO", vessel: "COSCO SHIPPING VIRGO", voyage: "126S", commodity: "Machinery parts", incoterm: "FOB", sales: "sales@cangzhan.com", ops: "ops@cangzhan.com", currency: "USD", sell: 1180, buy: 905 },
  { id: "s17", customerId: "c1", origin: "Shekou", destination: "Laem Chabang", pol: "CNSHK", pod: "THLCH", direction: "IMPORT", status: "ARRIVED", cleared: true, teu: 2, containerType: "40HC", etd: -13, eta: -5, carrier: "ONE", vessel: "ONE HARMONY", voyage: "061S", commodity: "Furniture", incoterm: "FOB", sales: "sales@cangzhan.com", ops: "cs@cangzhan.com", currency: "USD", sell: 1090, buy: 850 },
  { id: "s18", customerId: "c3", origin: "Qingdao", destination: "Laem Chabang", pol: "CNTAO", pod: "THLCH", direction: "IMPORT", status: "ARRIVED", cleared: true, teu: 2, containerType: "20GP", etd: -12, eta: -4, carrier: "PIL", vessel: "KOTA HAKIM", voyage: "0158S", commodity: "Chemicals (non-hazardous)", incoterm: "CIF", sales: "admin@cangzhan.com", ops: "ops@cangzhan.com", currency: "USD", sell: 820, buy: 640 },
  // Delivered (older, already invoiced)
  { id: "s19", customerId: "c7", origin: "Shanghai", destination: "Bangkok", pol: "CNSHA", pod: "THBKK", direction: "IMPORT", status: "DELIVERED", teu: 4, containerType: "40HC", etd: -80, eta: -73, carrier: "MSC", vessel: "MSC VIRGO", voyage: "FL528S", commodity: "Cotton yarn", incoterm: "CFR", sales: "admin@cangzhan.com", ops: "cs@cangzhan.com", currency: "USD", sell: 1040, buy: 815 },
  { id: "s20", customerId: "c5", origin: "Ningbo", destination: "Bangkok", pol: "CNNGB", pod: "THBKK", direction: "IMPORT", status: "DELIVERED", teu: 2, containerType: "40HC", etd: -75, eta: -68, carrier: "CMA CGM", vessel: "CMA CGM TAGE", voyage: "0TX1QS1", commodity: "General merchandise", incoterm: "FOB", sales: "chen@cangzhan.com", ops: "ops@cangzhan.com", currency: "USD", sell: 1050, buy: 830 },
  { id: "s21", customerId: "c1", origin: "Yantian", destination: "Laem Chabang", pol: "CNYTN", pod: "THLCH", direction: "IMPORT", status: "DELIVERED", teu: 4, containerType: "40HC", etd: -100, eta: -93, carrier: "COSCO", vessel: "COSCO SHIPPING LEO", voyage: "109S", commodity: "Furniture", incoterm: "FOB", sales: "sales@cangzhan.com", ops: "ops@cangzhan.com", currency: "USD", sell: 1090, buy: 850 },
  { id: "s22", customerId: "c10", origin: "Laem Chabang", destination: "Qingdao", pol: "THLCH", pod: "CNTAO", direction: "EXPORT", status: "DELIVERED", teu: 2, containerType: "20GP", etd: -38, eta: -30, carrier: "Evergreen", vessel: "EVER BRAVE", voyage: "1119N", commodity: "Natural rubber", incoterm: "CIF", sales: "chen@cangzhan.com", ops: "cs@cangzhan.com", currency: "THB", sell: 23500, buy: 18400 },
];

type DemoContainer = {
  containerNo: string;
  customerId: string;
  jobId?: string;
  type: string;
  dir: "in" | "out";
  status: "yard" | "sail" | "clear" | "hold" | "empty";
  yardCode: string;
  bl: string;
  teu: number;
  vessel?: string;
  pol: string;
  pod: string;
  seal?: string;
  commodity?: string;
  /** ETA offset for containers without a job. */
  eta?: number;
};

const DEMO_CONTAINERS: DemoContainer[] = [
  { containerNo: "MSCU4829103", customerId: "c1", jobId: "s3", type: "40HC", dir: "in", status: "sail", yardCode: "YTN-T3", bl: "SHZ25090281", teu: 2, vessel: "MSC LONDON", pol: "CNYTN", pod: "THLCH", seal: "ML-CN882901", commodity: "Furniture" },
  { containerNo: "COSU7193348", customerId: "c4", jobId: "s1", type: "20GP", dir: "in", status: "hold", yardCode: "NSA-T1", bl: "NSA25082911", teu: 1, vessel: "COSCO SHIPPING ARIES", pol: "CNNSA", pod: "THLCH", seal: "CS-771902", commodity: "Machinery parts" },
  { containerNo: "OOLU2611084", customerId: "c2", jobId: "s7", type: "40HC", dir: "in", status: "sail", yardCode: "LCB-B4", bl: "NGB25081844", teu: 2, vessel: "OOCL BANGKOK", pol: "CNNGB", pod: "THBKK", commodity: "Plastic resin" },
  { containerNo: "EMCU9037712", customerId: "c5", jobId: "s5", type: "40HC", dir: "in", status: "yard", yardCode: "YIW-BONDED", bl: "YIW25090102", teu: 2, vessel: "CMA CGM THALASSA", pol: "CNNGB", pod: "THBKK", commodity: "General merchandise" },
  { containerNo: "TEMU5541209", customerId: "c3", jobId: "s6", type: "20GP", dir: "in", status: "hold", yardCode: "LCB-C1", bl: "TAO25080177", teu: 1, vessel: "PIL BANGKOK", pol: "CNTAO", pod: "THLCH", commodity: "Chemicals (non-hazardous)" },
  { containerNo: "CMAU3382106", customerId: "c6", jobId: "s8", type: "40HC", dir: "in", status: "sail", yardCode: "HMN-BARGE", bl: "DGN25082209", teu: 2, vessel: "SITC HAIPHONG", pol: "CNHMN", pod: "THLCH", commodity: "Electronics" },
  { containerNo: "TCLU8820145", customerId: "c8", type: "40HC", dir: "in", status: "empty", yardCode: "LCB-EMPTY", bl: "LCB25083001", teu: 2, pol: "THLCH", pod: "THLCH", eta: -1 },
  { containerNo: "FCIU1479033", customerId: "c7", jobId: "s10", type: "20GP", dir: "in", status: "sail", yardCode: "SHA-WGQ", bl: "SHA25081560", teu: 1, vessel: "WAN HAI 302", pol: "CNSHA", pod: "THBKK", commodity: "Cotton yarn" },
  { containerNo: "GESU6108821", customerId: "c1", jobId: "s3", type: "40HC", dir: "in", status: "sail", yardCode: "YTN-YARD", bl: "SHZ25090281", teu: 2, vessel: "MSC LONDON", pol: "CNYTN", pod: "THLCH", seal: "ML-CN882902", commodity: "Furniture" },
  { containerNo: "HLXU2299017", customerId: "c4", jobId: "s1", type: "40HC", dir: "in", status: "hold", yardCode: "NSA-HOLD", bl: "NSA25083022", teu: 2, vessel: "COSCO SHIPPING ARIES", pol: "CNNSA", pod: "THLCH", seal: "CS-771903", commodity: "Machinery parts" },
  { containerNo: "MSCU9012284", customerId: "c5", jobId: "s5", type: "20GP", dir: "in", status: "yard", yardCode: "YIW-CFS", bl: "YIW25082755", teu: 1, vessel: "CMA CGM THALASSA", pol: "CNNGB", pod: "THBKK", commodity: "General merchandise" },
  { containerNo: "COSU4410876", customerId: "c2", type: "40HC", dir: "in", status: "clear", yardCode: "SPK-WH", bl: "NGB25080103", teu: 2, pol: "CNNGB", pod: "THBKK", commodity: "Plastic resin", eta: -8 },
  { containerNo: "TCLU3308812", customerId: "c9", jobId: "s2", type: "40RF", dir: "out", status: "sail", yardCode: "LCB-A2", bl: "LCB25090201", teu: 2, vessel: "ONE COMMITMENT", pol: "THLCH", pod: "CNYTN", seal: "ONE-330881", commodity: "Frozen food" },
  { containerNo: "MSCU2201198", customerId: "c9", jobId: "s2", type: "40RF", dir: "out", status: "sail", yardCode: "LCB-QUAY", bl: "LCB25082844", teu: 2, vessel: "ONE COMMITMENT", pol: "THLCH", pod: "CNYTN", commodity: "Frozen food" },
  { containerNo: "OOLU8844011", customerId: "c10", jobId: "s9", type: "20GP", dir: "out", status: "yard", yardCode: "LCB-B1", bl: "LCB25090155", teu: 1, vessel: "EVER BLISS", pol: "THLCH", pod: "CNNGB", commodity: "Natural rubber" },
  { containerNo: "EGHU3021457", customerId: "c10", jobId: "s9", type: "20GP", dir: "out", status: "yard", yardCode: "LCB-B2", bl: "LCB25090155", teu: 1, vessel: "EVER BLISS", pol: "THLCH", pod: "CNNGB", commodity: "Natural rubber" },
  { containerNo: "YMLU5520981", customerId: "c8", jobId: "s11", type: "40HC", dir: "out", status: "clear", yardCode: "YTN-YARD", bl: "LCB25081190", teu: 2, vessel: "YM WELLNESS", pol: "THLCH", pod: "CNYTN" },
  { containerNo: "EITU1182054", customerId: "c6", jobId: "s14", type: "20GP", dir: "out", status: "yard", yardCode: "LCB-B3", bl: "LCB25092210", teu: 1, vessel: "EVER CONNECT", pol: "THLCH", pod: "CNSHK", seal: "EG-118205", commodity: "Canned fruit" },
  { containerNo: "EITU1182069", customerId: "c6", jobId: "s14", type: "20GP", dir: "out", status: "yard", yardCode: "LCB-B3", bl: "LCB25092210", teu: 1, vessel: "EVER CONNECT", pol: "THLCH", pod: "CNSHK", seal: "EG-118206", commodity: "Canned fruit" },
  { containerNo: "SITU2940371", customerId: "c5", jobId: "s15", type: "40HC", dir: "in", status: "sail", yardCode: "LCB-B5", bl: "XMN25092302", teu: 2, vessel: "SITC XIAMEN", pol: "CNXMN", pod: "THBKK", seal: "SI-294037", commodity: "Ceramic tiles" },
  { containerNo: "CSNU6620418", customerId: "c4", jobId: "s16", type: "40HC", dir: "in", status: "hold", yardCode: "LCB-C2", bl: "NSA25091807", teu: 2, vessel: "COSCO SHIPPING VIRGO", pol: "CNNSA", pod: "THLCH", seal: "CS-662041", commodity: "Machinery parts" },
  { containerNo: "CSNU6620423", customerId: "c4", jobId: "s16", type: "40HC", dir: "in", status: "hold", yardCode: "LCB-C2", bl: "NSA25091807", teu: 2, vessel: "COSCO SHIPPING VIRGO", pol: "CNNSA", pod: "THLCH", seal: "CS-662042", commodity: "Machinery parts" },
  { containerNo: "ONEU0417736", customerId: "c1", jobId: "s17", type: "40HC", dir: "in", status: "clear", yardCode: "LCB-D2", bl: "SHK25091406", teu: 2, vessel: "ONE HARMONY", pol: "CNSHK", pod: "THLCH", seal: "ONE-041773", commodity: "Furniture" },
  { containerNo: "PCIU8830125", customerId: "c3", jobId: "s18", type: "20GP", dir: "in", status: "clear", yardCode: "LCB-C3", bl: "TAO25091520", teu: 1, vessel: "KOTA HAKIM", pol: "CNTAO", pod: "THLCH", commodity: "Chemicals (non-hazardous)" },
  { containerNo: "PCIU8830130", customerId: "c3", jobId: "s18", type: "20GP", dir: "in", status: "clear", yardCode: "LCB-C3", bl: "TAO25091520", teu: 1, vessel: "KOTA HAKIM", pol: "CNTAO", pod: "THLCH", commodity: "Chemicals (non-hazardous)" },
  { containerNo: "MEDU7720614", customerId: "c7", jobId: "s19", type: "40HC", dir: "in", status: "empty", yardCode: "LCB-EMPTY", bl: "SHA25070811", teu: 2, vessel: "MSC VIRGO", pol: "CNSHA", pod: "THBKK", commodity: "Cotton yarn" },
  { containerNo: "MEDU7720629", customerId: "c7", jobId: "s19", type: "40HC", dir: "in", status: "empty", yardCode: "LCB-EMPTY", bl: "SHA25070811", teu: 2, vessel: "MSC VIRGO", pol: "CNSHA", pod: "THBKK", commodity: "Cotton yarn" },
  { containerNo: "CMAU5518840", customerId: "c5", jobId: "s20", type: "40HC", dir: "in", status: "empty", yardCode: "LCB-EMPTY", bl: "NGB25071402", teu: 2, vessel: "CMA CGM TAGE", pol: "CNNGB", pod: "THBKK", commodity: "General merchandise" },
  { containerNo: "CSLU3301876", customerId: "c1", jobId: "s21", type: "40HC", dir: "in", status: "empty", yardCode: "LCB-EMPTY", bl: "SHZ25061903", teu: 2, vessel: "COSCO SHIPPING LEO", pol: "CNYTN", pod: "THLCH", commodity: "Furniture" },
  { containerNo: "CSLU3301881", customerId: "c1", jobId: "s21", type: "40HC", dir: "in", status: "empty", yardCode: "LCB-EMPTY", bl: "SHZ25061903", teu: 2, vessel: "COSCO SHIPPING LEO", pol: "CNYTN", pod: "THLCH", commodity: "Furniture" },
  { containerNo: "EGHU4410328", customerId: "c10", jobId: "s22", type: "20GP", dir: "out", status: "clear", yardCode: "TAO", bl: "LCB25082107", teu: 1, vessel: "EVER BRAVE", pol: "THLCH", pod: "CNTAO", commodity: "Natural rubber" },
  { containerNo: "EGHU4410333", customerId: "c10", jobId: "s22", type: "20GP", dir: "out", status: "clear", yardCode: "TAO", bl: "LCB25082107", teu: 1, vessel: "EVER BRAVE", pol: "THLCH", pod: "CNTAO", commodity: "Natural rubber" },
];

/** Carrier → vendor that bills the ocean freight (only the lines we have vendor records for). */
const CARRIER_VENDOR: Record<string, string> = { COSCO: "v1", MSC: "v2" };

/**
 * Local charges in USD per unit; THB jobs use ×34 (rounded to 50).
 * Import jobs pay destination THC + customs + delivery trucking; export jobs pay origin THC + pickup trucking.
 */
const LOCAL_CHARGES = [
  { code: "THC", description: "Terminal handling charge (THC)", unit: "PER_CONTAINER", sell: 150, buy: 118, vendor: "v3", only: null },
  { code: "DOC_FEE", description: "Documentation fee (B/L)", unit: "PER_BL", sell: 55, buy: 30, vendor: "carrier", only: null },
  { code: "CUSTOMS", description: "Customs clearance", unit: "PER_SHIPMENT", sell: 95, buy: 62, vendor: "v5", only: "IMPORT" },
  { code: "TRUCKING", description: "Trucking (port ⇄ warehouse)", unit: "PER_CONTAINER", sell: 280, buy: 215, vendor: "v4", only: null },
] as const;

export type DemoCharge = {
  id: string;
  jobId: string;
  chargeCode: string;
  chargeType: "REVENUE" | "COST";
  source: string;
  description: string;
  quantity: string;
  unit: string;
  currency: string;
  unitAmount: string;
  totalAmount: string;
  vendorId: string | null;
  customerId: string | null;
};

/** Deterministic sell / cost lines for a demo job. The ocean-freight ids predate the rest and are kept. */
export function demoJobCharges(j: Pick<DemoJob, "id" | "customerId" | "direction" | "currency" | "sell" | "buy" | "carrier">, containerCount: number): DemoCharge[] {
  const fx = j.currency === "THB" ? 34 : 1;
  const local = (usd: number) => (fx === 1 ? usd : Math.round((usd * fx) / 50) * 50);
  const carrierVendor = CARRIER_VENDOR[j.carrier] ?? null;
  const out: DemoCharge[] = [];
  const push = (code: string, description: string, unit: string, qty: number, sell: number, buy: number, vendorId: string | null, idBase: string) => {
    for (const kind of ["REVENUE", "COST"] as const) {
      const unitAmount = kind === "REVENUE" ? sell : buy;
      out.push({
        id: `${idBase}-${kind === "REVENUE" ? "rev" : "cost"}`,
        jobId: j.id,
        chargeCode: code,
        chargeType: kind,
        source: "SEED",
        description,
        quantity: String(qty),
        unit,
        currency: j.currency,
        unitAmount: String(unitAmount),
        totalAmount: String(unitAmount * qty),
        vendorId: kind === "COST" ? vendorId : null,
        customerId: kind === "REVENUE" ? j.customerId : null,
      });
    }
  };
  push("OCEAN_FREIGHT", "Ocean freight", "PER_CONTAINER", containerCount, j.sell, j.buy, carrierVendor, `sc-seed-${j.id}`);
  for (const c of LOCAL_CHARGES) {
    if (c.only && c.only !== j.direction) continue;
    const qty = c.unit === "PER_CONTAINER" ? containerCount : 1;
    const vendor = c.vendor === "carrier" ? carrierVendor : c.vendor;
    push(c.code, c.description, c.unit, qty, local(c.sell), local(c.buy), vendor, `sc-seed-${j.id}-${c.code.toLowerCase()}`);
  }
  return out;
}

/** Demo jobs (with resolved container counts) for other seed modules. */
export function demoJobsForSeed() {
  return DEMO_JOBS.map((j) => ({ ...j, containerCount: DEMO_CONTAINERS.filter((c) => c.jobId === j.id).length || Math.max(1, Math.ceil(j.teu / 2)) }));
}

const DAY = 24 * 60 * 60 * 1000;

/** Calendar date (YYYY-MM-DD) in Bangkok time, `days` from `base`. */
export function bangkokDate(base: Date, days: number): string {
  const d = new Date(base.getTime() + days * DAY);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** A timestamp at a Bangkok wall-clock hour on the given YYYY-MM-DD date. */
function bangkokAt(date: string, hour: number): Date {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+07:00`);
}

const STATUS_RANK: Record<DemoJob["status"], number> = { BOOKING: 0, GATE_IN: 1, SAIL: 2, ARRIVED: 3, DELIVERED: 5 };

/** Seeded jobs also carry a final "Delivered" step so the customs → delivered stages can be told apart. */
const SEED_MILESTONES = [...DEFAULT_MILESTONES, { code: "DELIVERED", label: "Delivered to consignee", sortOrder: 6 }] as const;

/**
 * Milestones consistent with ETD/ETA and the job status:
 * booking ETD-10, SI ETD-4, gate-in ETD-2, loaded ETD-1, sailed ETD, customs cleared ETA+1, delivered ETA+6.
 * A milestone is done only when its planned day has come AND the job status has reached it.
 */
export function milestonePlan(job: Pick<DemoJob, "etd" | "eta" | "status" | "cleared">, now: Date) {
  // Customs cleared (rank 4) sits between arrived and delivered.
  const rank = job.status === "ARRIVED" && job.cleared ? 4 : STATUS_RANK[job.status];
  const etd = bangkokDate(now, job.etd);
  const eta = bangkokDate(now, job.eta);
  const at = (date: string, offsetDays: number, hour: number) => bangkokAt(bangkokDate(new Date(`${date}T12:00:00+07:00`), offsetDays), hour);
  const plan: Record<string, { planned: Date; needsRank: number }> = {
    BOOKING: { planned: at(etd, -10, 10), needsRank: 0 },
    SI: { planned: at(etd, -4, 17), needsRank: 1 },
    GATE_IN: { planned: at(etd, -2, 14), needsRank: 1 },
    LOADED: { planned: at(etd, -1, 20), needsRank: 1 },
    SAILED: { planned: at(etd, 0, 6), needsRank: 2 },
    CLEAR: { planned: at(eta, 1, 15), needsRank: 4 },
    DELIVERED: { planned: at(eta, 6, 11), needsRank: 5 },
  };
  return SEED_MILESTONES.map((m) => {
    const p = plan[m.code]!;
    // Reached by status and planned for today or earlier (so a gate-in job shows its gate-in at any hour).
    const done = rank >= p.needsRank && bangkokDate(p.planned, 0) <= bangkokDate(now, 0);
    // Actual time: planned plus a small, deterministic slip (0–5h).
    const actualAt = done ? new Date(Math.min(p.planned.getTime() + ((m.sortOrder * 7) % 6) * 60 * 60 * 1000, now.getTime())) : null;
    return { code: m.code, label: m.label, sortOrder: m.sortOrder, plannedAt: p.planned, actualAt };
  });
}

export async function seedOperations(db: Db, now = new Date()) {
  const emails = [...new Set(DEMO_JOBS.flatMap((j) => [j.sales, j.ops]))];
  const userRows = await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.email, emails));
  const userId = new Map(userRows.map((u) => [u.email, u.id]));

  // Job numbers already taken by user-created jobs are skipped rather than clobbered.
  const fixed = DEMO_JOBS.flatMap((j) => (j.jobNumber ? [j.jobNumber] : []));
  const taken = await db.select({ id: jobs.id, n: jobs.jobNumber }).from(jobs).where(inArray(jobs.jobNumber, fixed));
  const blocked = new Set(taken.filter((t) => !DEMO_JOBS.some((j) => j.id === t.id && j.jobNumber === t.n)).map((t) => t.n));
  const seededJobs = DEMO_JOBS.filter((j) => !j.jobNumber || !blocked.has(j.jobNumber));

  // Newer demo jobs keep the number they got on their first seed; otherwise take the next one.
  const existing = await db.select({ id: jobs.id, n: jobs.jobNumber }).from(jobs).where(inArray(jobs.id, seededJobs.map((j) => j.id)));
  const numberById = new Map(existing.map((r) => [r.id, r.n]));
  // Fixed-number jobs go first, and the sequence is synced only right before the first new number,
  // so on a fresh database a new job can never take a number a fixed demo job needs.
  const ordered = [...seededJobs].sort((a, b) => Number(!a.jobNumber) - Number(!b.jobNumber));
  let synced = false;
  const allocate = async () => {
    if (!synced) {
      await syncDocSequences(db);
      synced = true;
    }
    return nextDocNumber(db, "JOB", "JOB");
  };

  for (const demo of ordered) {
    const jobNumber = demo.jobNumber ?? numberById.get(demo.id) ?? (await allocate());
    const j = { ...demo, jobNumber };
    const containerCount = DEMO_CONTAINERS.filter((c) => c.jobId === j.id).length || Math.max(1, Math.ceil(j.teu / 2));
    const values = {
      organizationId: DEMO_ORG_ID,
      jobNumber: j.jobNumber,
      customerId: j.customerId,
      direction: j.direction,
      mode: "SEA_FCL",
      incoterm: j.incoterm,
      origin: j.origin,
      destination: j.destination,
      pol: j.pol,
      pod: j.pod,
      carrier: j.carrier,
      bookingNumber: `${j.carrier.replace(/\s+/g, "").slice(0, 4).toUpperCase()}${j.jobNumber.slice(-5)}`,
      masterBl: `${j.carrier.replace(/\s+/g, "").slice(0, 4).toUpperCase()}${j.pol.slice(2)}${j.jobNumber.slice(-6)}`,
      vessel: j.vessel,
      voyage: j.voyage,
      etd: bangkokDate(now, j.etd),
      eta: bangkokDate(now, j.eta),
      commodity: j.commodity,
      containerType: j.containerType,
      containerCount,
      teu: j.teu,
      salesOwnerId: userId.get(j.sales) ?? null,
      assignedOperator: userId.get(j.ops) ?? null,
      status: j.status,
      currency: j.currency,
      updatedAt: now,
    };
    await db
      .insert(jobs)
      .values({ id: j.id, ...values })
      .onConflictDoUpdate({ target: jobs.id, set: values });

    for (const m of milestonePlan(j, now)) {
      await db
        .insert(jobMilestones)
        .values({ id: `ms-${j.id}-${m.code}`, jobId: j.id, ...m })
        .onConflictDoUpdate({
          target: [jobMilestones.jobId, jobMilestones.code],
          set: { label: m.label, sortOrder: m.sortOrder, plannedAt: m.plannedAt, actualAt: m.actualAt },
        });
    }

    // Sell + cost lines per job (ocean freight, THC, doc fee, customs, trucking) so gross profit,
    // "invoice from job" and vendor bills have realistic data. Seeded lines are refreshed in place;
    // invoiced / billed flags are owned by seed-finance.ts and user actions.
    for (const ch of demoJobCharges(j, containerCount)) {
      const { id, ...set } = ch;
      await db
        .insert(shipmentCharges)
        .values(ch)
        .onConflictDoUpdate({ target: shipmentCharges.id, set: { ...set, updatedAt: now } });
    }
  }

  const jobById = new Map<string, DemoJob>(seededJobs.map((j) => [j.id, j]));
  for (const c of DEMO_CONTAINERS) {
    const job = c.jobId ? jobById.get(c.jobId) : undefined;
    const etaOffset = job ? job.eta : (c.eta ?? 0);
    const values = {
      organizationId: DEMO_ORG_ID,
      customerId: c.customerId,
      jobId: job ? job.id : null,
      containerNo: c.containerNo,
      type: c.type,
      status: c.status,
      direction: c.dir,
      bl: c.bl,
      yardCode: c.yardCode,
      teu: c.teu,
      eta: bangkokDate(now, etaOffset),
      pol: c.pol,
      pod: c.pod,
      vessel: c.vessel ?? null,
      seal: c.seal ?? null,
      commodity: c.commodity ?? null,
      updatedAt: now,
    };
    await db
      .insert(containers)
      .values({ id: `ctr-${c.containerNo}`, ...values })
      .onConflictDoUpdate({ target: containers.containerNo, set: values });
  }

  // Job to-dos with due dates around today (overdue / today / later). Titles are sample text
  // translated on screen by src/v2/lib/demoText.ts. "Done" is only set on first insert.
  for (const t of DEMO_JOB_TASKS) {
    if (!jobById.has(t.jobId)) continue;
    const set = { title: t.title, dueAt: bangkokAt(bangkokDate(now, t.due), t.hour), owner: t.owner, priority: t.priority, updatedAt: now };
    await db
      .insert(jobTasks)
      .values({ id: t.id, organizationId: DEMO_ORG_ID, jobId: t.jobId, done: t.done ?? false, ...set })
      .onConflictDoUpdate({ target: jobTasks.id, set });
  }

  // Legacy Chinese yard labels on any remaining rows → neutral codes.
  for (const [label, code] of Object.entries(LEGACY_YARD_CODES)) {
    await db.execute(sql`UPDATE containers SET yard_code = ${code} WHERE yard_code = ${label}`);
  }

  return { skipped: false, containers: DEMO_CONTAINERS.length, jobs: seededJobs.length };
}

const DEMO_JOB_TASKS: Array<{ id: string; jobId: string; title: string; due: number; hour: number; owner: string; priority: "high" | "mid" | "low"; done?: boolean }> = [
  { id: "jt-seed-01", jobId: "s16", title: "预约南沙到港两柜海关查验", due: 0, hour: 10, owner: "马思远", priority: "high" },
  { id: "jt-seed-02", jobId: "s16", title: "补传南沙两柜产地证", due: -1, hour: 16, owner: "马思远", priority: "high" },
  { id: "jt-seed-03", jobId: "s17", title: "蛇口家具柜安排派送", due: 0, hour: 14, owner: "纳帕·西苏", priority: "mid" },
  { id: "jt-seed-04", jobId: "s3", title: "跟进 MSC 延误新 ETA", due: -1, hour: 11, owner: "马思远", priority: "high" },
  { id: "jt-seed-05", jobId: "s10", title: "通知上海东盟船期延误", due: 0, hour: 15, owner: "纳帕·西苏", priority: "mid" },
  { id: "jt-seed-06", jobId: "s1", title: "南沙三柜补料截止", due: 1, hour: 12, owner: "马思远", priority: "high" },
  { id: "jt-seed-07", jobId: "s9", title: "树胶柜 VGM 提交", due: 0, hour: 17, owner: "纳帕·西苏", priority: "mid" },
  { id: "jt-seed-08", jobId: "s14", title: "蛇口罐头柜装箱照片", due: 1, hour: 10, owner: "纳帕·西苏", priority: "mid" },
  { id: "jt-seed-09", jobId: "s12", title: "罗勇冷冻柜预冷确认", due: 1, hour: 9, owner: "纳帕·西苏", priority: "high" },
  { id: "jt-seed-10", jobId: "s13", title: "上海汽配订舱确认", due: 3, hour: 11, owner: "马思远", priority: "low" },
  { id: "jt-seed-11", jobId: "s6", title: "青岛化工柜放行单", due: -2, hour: 15, owner: "马思远", priority: "high" },
  { id: "jt-seed-12", jobId: "s18", title: "青岛化工柜派车", due: 1, hour: 8, owner: "马思远", priority: "mid" },
  { id: "jt-seed-13", jobId: "s11", title: "空箱回运费用核对", due: -12, hour: 10, owner: "诗丽蓬·旺萨功", priority: "low", done: true },
];

/** Old seed labels (Chinese only) → neutral place codes understood by src/v2/lib/places.ts. */
const LEGACY_YARD_CODES: Record<string, string> = {
  盐田三期: "YTN-T3",
  南沙一期: "NSA-T1",
  "林查班 B4": "LCB-B4",
  义乌监管仓: "YIW-BONDED",
  "林查班 C1": "LCB-C1",
  虎门驳运: "HMN-BARGE",
  林查班空箱区: "LCB-EMPTY",
  "林查班 D2": "LCB-D2",
  盐田堆存: "YTN-YARD",
  南沙待补: "NSA-HOLD",
  义乌拼箱: "YIW-CFS",
  北榄仓: "SPK-WH",
  "林查班 A2": "LCB-A2",
  林查班码头: "LCB-QUAY",
  "林查班 B1": "LCB-B1",
};
