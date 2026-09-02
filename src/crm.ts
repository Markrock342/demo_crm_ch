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
];

export const leads: Lead[] = [
  { id: "l1", company: "春武里木业", city: "春武里", lane: "林查班 → 南沙", contact: "นภา ไม้ดี", source: "协会", stage: "working", teu: 12, owner: "周可", updated: "09-02" },
  { id: "l2", company: "罗勇石化包装", city: "罗勇", lane: "林查班 → 青岛", contact: "李卫东", source: "转介", stage: "new", teu: 6, owner: "陈一宁", updated: "09-01" },
  { id: "l3", company: "北榄冷链", city: "北榄", lane: "林查班 → 盐田", contact: "อรทัย เย็นดี", source: "邮件", stage: "qualified", teu: 20, owner: "林晓衡", updated: "08-30" },
  { id: "l4", company: "宋卡橡胶二厂", city: "宋卡", lane: "宋卡 → 宁波", contact: "สมชาย", source: "展会", stage: "lost", teu: 8, owner: "周可", updated: "08-22" },
];

export const deals: Deal[] = [
  { id: "d1", customerId: "c9", title: "冷冻食品 6×40HC 盐田", lane: "林查班 → 盐田", stage: "book", value: 186000, teu: 12, close: "09-12", owner: "林晓衡" },
  { id: "d2", customerId: "c10", title: "树胶 8×20GP 宁波", lane: "林查班 → 宁波", stage: "quote", value: 94000, teu: 8, close: "09-18", owner: "陈一宁" },
  { id: "d3", customerId: "c1", title: "家具回程 4×40HC", lane: "盐田 → 林查班", stage: "won", value: 72000, teu: 8, close: "09-08", owner: "周可" },
  { id: "d4", customerId: "c5", title: "义乌拼箱周班", lane: "义乌 → 北榄", stage: "qualify", value: 41000, teu: 6, close: "09-20", owner: "陈一宁" },
  { id: "d5", customerId: "c4", title: "南沙产地证滞留", lane: "南沙 → 林查班", stage: "billed", value: 128000, teu: 11, close: "08-28", owner: "周可" },
  { id: "d6", customerId: "c3", title: "青岛化工柜续约", lane: "前湾 → 林查班", stage: "quote", value: 56000, teu: 7, close: "09-22", owner: "马思远" },
];

export const tasks: TaskItem[] = [
  { id: "t1", title: "催 TCLU3308812 产地证扫描件", due: "09-02 16:00", owner: "林晓衡", priority: "high", done: false, customerId: "c9", boxId: "TCLU3308812" },
  { id: "t2", title: "回南沙两柜补件邮件", due: "09-02 16:00", owner: "周可", priority: "high", done: false, customerId: "c4" },
  { id: "t3", title: "青岛中泰八月对账回执", due: "09-03", owner: "马思远", priority: "mid", done: false, customerId: "c3" },
  { id: "t4", title: "北榄胶加柜报价两只 40HC", due: "09-04", owner: "陈一宁", priority: "mid", done: false, customerId: "c10" },
  { id: "t5", title: "空箱回运宁波舱位", due: "09-05", owner: "马思远", priority: "low", done: false, customerId: "c8" },
  { id: "t6", title: "协会见面纪要归档", due: "09-01", owner: "周可", priority: "low", done: true, customerId: "c9" },
];

export const activities: Activity[] = [
  { id: "a1", type: "mail", at: "09-02 15:10", user: "林晓衡", customerId: "c9", body: "罗勇来信：TCLU3308812 产地证未到，问盐田周五班。" },
  { id: "a2", type: "call", at: "09-02 11:20", user: "周可", customerId: "c4", body: "吴南确认两柜产地证下午补扫。" },
  { id: "a3", type: "note", at: "09-01 18:40", user: "陈一宁", customerId: "c10", body: "北榄胶要加两只 40HC，周三截关。" },
  { id: "a4", type: "meet", at: "08-30 14:00", user: "林晓衡", customerId: "c9", body: "春武里协会见面，谈林查班直航盐田。" },
  { id: "a5", type: "task", at: "08-28 09:40", user: "马思远", customerId: "c3", body: "重发八月对账单，账龄 41 天。" },
  { id: "a6", type: "note", at: "08-27 16:00", user: "周可", customerId: "c1", body: "盐田家具加柜超重，改 9 日班。" },
];

export const docs: CrmDoc[] = [
  { id: "f1", customerId: "c9", boxId: "TCLU3308812", kind: "CO", name: "C/O TCLU3308812", status: "wait", updated: "09-02" },
  { id: "f2", customerId: "c9", boxId: "TCLU3308812", kind: "BL", name: "B/L LCB25090201", status: "ok", updated: "09-01" },
  { id: "f3", customerId: "c4", boxId: "COSU7193348", kind: "CO", name: "C/O COSU7193348", status: "wait", updated: "09-02" },
  { id: "f4", customerId: "c4", boxId: "HLXU2299017", kind: "CO", name: "C/O HLXU2299017", status: "late", updated: "08-31" },
  { id: "f5", customerId: "c10", boxId: "OOLU8844011", kind: "BL", name: "B/L LCB25090155", status: "ok", updated: "09-01" },
  { id: "f6", customerId: "c10", boxId: "OOLU8844011", kind: "PL", name: "装箱单 树胶", status: "ok", updated: "08-30" },
  { id: "f7", customerId: "c3", boxId: "TEMU5541209", kind: "CI", name: "发票 八月", status: "wait", updated: "08-28" },
  { id: "f8", customerId: "c1", boxId: "MSCU4829103", kind: "BOOK", name: "订舱 盐田 9/6", status: "ok", updated: "09-01" },
];

export function money(n: number) {
  return `¥${n.toLocaleString()}`;
}
