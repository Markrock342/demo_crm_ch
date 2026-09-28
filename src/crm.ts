export type DealStage = "qualify" | "quote" | "won" | "book" | "billed";
export type LeadStage = "new" | "working" | "qualified" | "lost";
export type TaskPriority = "high" | "mid" | "low";
export type ActivityType = "note" | "call" | "meet" | "mail" | "task";
export type DocKind = "BL" | "CO" | "PL" | "CI" | "BOOK";
export type DocStatus = "ok" | "wait" | "late";

export type Contact = {
  id: string;
  customerId: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  wechat: string;
  /** LINE ID (live API only). */
  lineId?: string;
  primary: boolean;
};

export type Lead = {
  id: string;
  company: string;
  city: string;
  lane: string;
  contact: string;
  source: string;
  stage: LeadStage;
  teu: number;
  owner: string;
  updated: string;
};

export type Deal = {
  id: string;
  customerId: string;
  title: string;
  lane: string;
  stage: DealStage;
  value: number;
  teu: number;
  close: string;
  owner: string;
};

export type TaskItem = {
  id: string;
  title: string;
  due: string;
  owner: string;
  priority: TaskPriority;
  done: boolean;
  customerId?: string;
  boxId?: string;
};

export type Activity = {
  id: string;
  type: ActivityType;
  at: string;
  user: string;
  customerId?: string;
  body: string;
};

export type CrmDoc = {
  id: string;
  customerId: string;
  boxId: string;
  kind: DocKind;
  name: string;
  status: DocStatus;
  updated: string;
};

export const dealStages: DealStage[] = ["qualify", "quote", "won", "book", "billed"];
export const leadStages: LeadStage[] = ["new", "working", "qualified", "lost"];

export const dealStageI18n: Record<DealStage, string> = {
  qualify: "stageQualify",
  quote: "stageQuote",
  won: "stageWon",
  book: "stageBook",
  billed: "stageBilled",
};

export const leadStageI18n: Record<LeadStage, string> = {
  new: "leadNew",
  working: "leadWorking",
  qualified: "leadQualified",
  lost: "leadLost",
};

export const activityI18n: Record<ActivityType, string> = {
  note: "activityNote",
  call: "activityCall",
  meet: "activityMeet",
  mail: "activityMail",
  task: "activityTask",
};

export const priI18n: Record<TaskPriority, string> = {
  high: "priHigh",
  mid: "priMid",
  low: "priLow",
};

export function nextDealStage(s: DealStage): DealStage | null {
  const i = dealStages.indexOf(s);
  return i >= 0 && i < dealStages.length - 1 ? dealStages[i + 1] : null;
}

export const contacts: Contact[] = [
  { id: "p1", customerId: "c1", name: "赵海宁", title: "操作经理", email: "hai@huayun-sz.cn", phone: "+86 755 8612 1100", wechat: "zhaohn_yt", primary: true },
  { id: "p2", customerId: "c1", name: "陈可", title: "商务", email: "booking@huayun-sz.cn", phone: "+86 755 8612 1108", wechat: "chenk_sz", primary: false },
  { id: "p3", customerId: "c4", name: "吴南", title: "单证", email: "ops@nansha-lianyun.cn", phone: "+86 20 3900 4411", wechat: "wunan_nsa", primary: true },
  { id: "p4", customerId: "c9", name: "สุภาพร ศรีเมือง", title: "Export", email: "export@rayong-food.co.th", phone: "+66 38 611 220", wechat: "supaporn_ryg", primary: true },
  { id: "p5", customerId: "c10", name: "วิชัย ทองแท้", title: "Booking", email: "booking@splatex.co.th", phone: "+66 2 754 3301", wechat: "wichai_sp", primary: true },
  { id: "p6", customerId: "c3", name: "马思远", title: "财务", email: "finance@qd-zhongtai.com", phone: "+86 532 8098 2200", wechat: "masy_qd", primary: true },
  { id: "p7", customerId: "c5", name: "金小义", title: "仓配", email: "export@yiwu-cang.com", phone: "+86 579 8550 9910", wechat: "jinxiaoyi", primary: true },
  { id: "p8", customerId: "c2", name: "何北仑", title: "调度", email: "ops@nb-gangtai.cn", phone: "+86 574 8701 6600", wechat: "hebl_ngb", primary: true },
  { id: "p9", customerId: "c6", name: "梁志明", title: "操作", email: "ops@dg-liansheng.cn", phone: "+86 769 8512 3300", wechat: "liangzm_dg", primary: true },
  { id: "p10", customerId: "c7", name: "孙丽", title: "单证", email: "docs@sh-asean.com", phone: "+86 21 5046 7720", wechat: "sunli_sha", primary: true },
  { id: "p11", customerId: "c8", name: "ประเสริฐ ใจดี", title: "Yard manager", email: "yard@lcb-taihua.co.th", phone: "+66 38 490 551", wechat: "prasert_lcb", primary: true },
  { id: "p12", customerId: "c9", name: "ธนพล รุ่งเรือง", title: "Logistics", email: "logistics@rayong-food.co.th", phone: "+66 38 611 235", wechat: "thanapol_ryg", primary: false },
];

/** Demo dates stay relative to today ("MM-DD"), so the pipeline never looks all-overdue. */
function closeIn(days: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const leads: Lead[] = [
  { id: "l1", company: "春武里木业", city: "春武里", lane: "林查班 → 南沙", contact: "นภา ไม้ดี", source: "协会", stage: "working", teu: 12, owner: "周可", updated: closeIn(-2) },
  { id: "l2", company: "罗勇石化包装", city: "罗勇", lane: "林查班 → 青岛", contact: "李卫东", source: "转介", stage: "new", teu: 6, owner: "陈一宁", updated: closeIn(-3) },
  { id: "l3", company: "北榄冷链", city: "北榄", lane: "林查班 → 盐田", contact: "อรทัย เย็นดี", source: "邮件", stage: "qualified", teu: 20, owner: "林晓衡", updated: closeIn(-5) },
  { id: "l4", company: "宋卡橡胶二厂", city: "宋卡", lane: "宋卡 → 宁波", contact: "สมชาย", source: "展会", stage: "lost", teu: 8, owner: "周可", updated: closeIn(-13) },
  { id: "l5", company: "曼谷精密五金", city: "曼谷", lane: "宁波 → 曼谷", contact: "ปรีชา ช่างเหล็ก", source: "官网", stage: "new", teu: 10, owner: "陈一宁", updated: closeIn(-1) },
  { id: "l6", company: "春武里汽车配件", city: "春武里", lane: "上海 → 林查班", contact: "Somsak P.", source: "展会", stage: "working", teu: 24, owner: "周可", updated: closeIn(-2) },
  { id: "l7", company: "罗勇家电组装", city: "罗勇", lane: "蛇口 → 林查班", contact: "王建华", source: "转介", stage: "qualified", teu: 30, owner: "林晓衡", updated: closeIn(-3) },
  { id: "l8", company: "合艾海产出口", city: "合艾", lane: "林查班 → 香港", contact: "จันทร์เพ็ญ ทะเลงาม", source: "邮件", stage: "new", teu: 8, owner: "马思远", updated: closeIn(0) },
  { id: "l9", company: "泰国瓷砖进口", city: "曼谷", lane: "厦门 → 曼谷", contact: "วรวุฒิ ศรีสวัสดิ์", source: "官网", stage: "working", teu: 16, owner: "陈一宁", updated: closeIn(-4) },
  { id: "l10", company: "北榄电子仓储", city: "北榄", lane: "虎门 → 林查班", contact: "刘晓东", source: "协会", stage: "qualified", teu: 18, owner: "周可", updated: closeIn(-6) },
  { id: "l11", company: "宋卡木薯淀粉", city: "宋卡", lane: "林查班 → 青岛", contact: "สมพร แก้วใส", source: "展会", stage: "lost", teu: 12, owner: "马思远", updated: closeIn(-15) },
  { id: "l12", company: "泰国宠物食品", city: "曼谷", lane: "林查班 → 上海", contact: "Nattaya K.", source: "转介", stage: "working", teu: 14, owner: "林晓衡", updated: closeIn(-1) },
];

export const deals: Deal[] = [
  { id: "d1", customerId: "c9", title: "冷冻食品 6×40HC 盐田", lane: "林查班 → 盐田", stage: "book", value: 186000, teu: 12, close: closeIn(5), owner: "林晓衡" },
  { id: "d2", customerId: "c10", title: "树胶 8×20GP 宁波", lane: "林查班 → 宁波", stage: "quote", value: 94000, teu: 8, close: closeIn(12), owner: "陈一宁" },
  { id: "d3", customerId: "c1", title: "家具回程 4×40HC", lane: "盐田 → 林查班", stage: "won", value: 72000, teu: 8, close: closeIn(-20), owner: "周可" },
  { id: "d4", customerId: "c5", title: "义乌拼箱周班", lane: "义乌 → 北榄", stage: "qualify", value: 41000, teu: 6, close: closeIn(18), owner: "陈一宁" },
  { id: "d5", customerId: "c4", title: "南沙产地证滞留", lane: "南沙 → 林查班", stage: "billed", value: 128000, teu: 11, close: closeIn(-30), owner: "周可" },
  { id: "d6", customerId: "c3", title: "青岛化工柜续约", lane: "前湾 → 林查班", stage: "quote", value: 56000, teu: 7, close: closeIn(8), owner: "马思远" },
  { id: "d7", customerId: "c7", title: "上海棉纱月度合约", lane: "上海 → 曼谷", stage: "quote", value: 88000, teu: 8, close: closeIn(9), owner: "林晓衡" },
  { id: "d8", customerId: "c2", title: "宁波塑料粒季度标", lane: "宁波 → 曼谷", stage: "qualify", value: 64000, teu: 10, close: closeIn(21), owner: "林晓衡" },
  { id: "d9", customerId: "c6", title: "东莞电子旺季加舱", lane: "虎门 → 林查班", stage: "book", value: 112000, teu: 12, close: closeIn(3), owner: "陈一宁" },
  { id: "d10", customerId: "c8", title: "空箱回运年度协议", lane: "林查班 → 盐田", stage: "won", value: 45000, teu: 20, close: closeIn(-6), owner: "马思远" },
  { id: "d11", customerId: "c3", title: "青岛化工新品试单", lane: "青岛 → 林查班", stage: "qualify", value: 38000, teu: 4, close: closeIn(25), owner: "马思远" },
  { id: "d12", customerId: "c1", title: "盐田家具九月加柜", lane: "盐田 → 林查班", stage: "billed", value: 96000, teu: 8, close: closeIn(-15), owner: "周可" },
  { id: "d13", customerId: "c9", title: "冷冻虾旺季包舱", lane: "林查班 → 盐田", stage: "quote", value: 210000, teu: 16, close: closeIn(14), owner: "林晓衡" },
];

// Tasks and activities are stored in the database (server/db/seed-tasks.ts) and served by /api/tasks, /api/activities.

export const docs: CrmDoc[] = [
  { id: "f1", customerId: "c9", boxId: "TCLU3308812", kind: "CO", name: "C/O TCLU3308812", status: "wait", updated: closeIn(0) },
  { id: "f2", customerId: "c9", boxId: "TCLU3308812", kind: "BL", name: "B/L LCB25090201", status: "ok", updated: closeIn(-1) },
  { id: "f3", customerId: "c4", boxId: "COSU7193348", kind: "CO", name: "C/O COSU7193348", status: "wait", updated: closeIn(0) },
  { id: "f4", customerId: "c4", boxId: "HLXU2299017", kind: "CO", name: "C/O HLXU2299017", status: "late", updated: closeIn(-2) },
  { id: "f5", customerId: "c10", boxId: "OOLU8844011", kind: "BL", name: "B/L LCB25090155", status: "ok", updated: closeIn(-1) },
  { id: "f6", customerId: "c10", boxId: "OOLU8844011", kind: "PL", name: "装箱单 树胶", status: "ok", updated: closeIn(-3) },
  { id: "f7", customerId: "c3", boxId: "TEMU5541209", kind: "CI", name: "发票 八月", status: "wait", updated: closeIn(-5) },
  { id: "f8", customerId: "c1", boxId: "MSCU4829103", kind: "BOOK", name: "订舱 盐田 9/6", status: "ok", updated: closeIn(-1) },
  { id: "f9", customerId: "c4", boxId: "CSNU6620418", kind: "CO", name: "C/O CSNU6620418", status: "late", updated: closeIn(-1) },
  { id: "f10", customerId: "c4", boxId: "CSNU6620418", kind: "BL", name: "B/L NSA25091807", status: "ok", updated: closeIn(-6) },
  { id: "f11", customerId: "c1", boxId: "ONEU0417736", kind: "BL", name: "B/L SHK25091406", status: "ok", updated: closeIn(-9) },
  { id: "f12", customerId: "c1", boxId: "ONEU0417736", kind: "CI", name: "Commercial invoice SHK25091406", status: "ok", updated: closeIn(-8) },
  { id: "f13", customerId: "c3", boxId: "PCIU8830125", kind: "PL", name: "Packing list TAO25091520", status: "ok", updated: closeIn(-7) },
  { id: "f14", customerId: "c5", boxId: "SITU2940371", kind: "BL", name: "B/L XMN25092302", status: "ok", updated: closeIn(-2) },
  { id: "f15", customerId: "c5", boxId: "SITU2940371", kind: "CO", name: "Form E SITU2940371", status: "wait", updated: closeIn(-1) },
  { id: "f16", customerId: "c6", boxId: "EITU1182054", kind: "BOOK", name: "Booking EVER CONNECT 0612N", status: "ok", updated: closeIn(-5) },
  { id: "f17", customerId: "c6", boxId: "EITU1182054", kind: "PL", name: "Packing list EITU1182054", status: "wait", updated: closeIn(0) },
  { id: "f18", customerId: "c7", boxId: "FCIU1479033", kind: "CO", name: "C/O FCIU1479033", status: "late", updated: closeIn(-4) },
  { id: "f19", customerId: "c2", boxId: "OOLU2611084", kind: "CI", name: "Commercial invoice NGB25081844", status: "ok", updated: closeIn(-6) },
  { id: "f20", customerId: "c5", boxId: "EMCU9037712", kind: "BOOK", name: "Booking CMA CGM THALASSA 0TX3AS1", status: "ok", updated: closeIn(-3) },
];

export function money(n: number) {
  return `¥${n.toLocaleString()}`;
}
