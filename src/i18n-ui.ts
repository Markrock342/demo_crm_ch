/**
 * UI-redesign strings. Merged last in i18n.ts so these win over older labels.
 * Page-specific strings live in src/i18n-pages/<area>.ts (each exports zh / th / en).
 */
type Dict = Record<string, string>;
type Book = { zh: Dict; th: Dict; en: Dict };

const shellZh: Dict = {
  stage_booked: "已订舱",
  stage_gatein: "进港",
  stage_sailed: "已开船",
  stage_arrived: "已到港",
  stage_customs: "清关",
  stage_delivered: "已送达",
  viewCards: "卡片视图",
  viewList: "列表视图",
  navGroupHome: "首页",
  navGroupSales: "销售",
  navGroupOps: "营运",
  navGroupFinance: "财务",
  navGroupSystem: "系统",
  navOverview: "总览",
  navActionCenter: "待处理",
  navJobs: "工作单",
  navReports: "报表",
  quickCreate: "新建",
  quickNewQuote: "新建报价单",
  quickNewJob: "新建工作单",
  quickNewCustomer: "新建客户",
  quickNewLead: "新建潜在客户",
  searchShort: "搜索",
  account: "账户",
  collapseMenu: "收起菜单",
  expandMenu: "展开菜单",
  aiAsk: "AI 摘要",
  aiPanelTitle: "AI 摘要",
  aiRegenerate: "重新生成",
  filterAll: "全部",
  filterSearch: "搜索…",
  clearFilters: "清除筛选",
  resultsCount: "{n} 条",
  noResults: "没有符合条件的记录",
  noResultsHint: "试试清除筛选或换个关键词。",
  back: "返回",
  status_DRAFT: "草稿",
  status_SENT: "已发送",
  status_ACCEPTED: "已接受",
  status_REJECTED: "已拒绝",
  status_EXPIRED: "已过期",
  status_OPEN: "未结",
  status_IN_PROGRESS: "处理中",
  status_BOOKED: "已订舱",
  status_IN_TRANSIT: "运输中",
  status_ARRIVED: "已到港",
  status_DELIVERED: "已交付",
  status_CLOSED: "已关闭",
  status_CANCELLED: "已取消",
  status_ISSUED: "已开具",
  status_UNBILLED: "未开票",
  status_INVOICED: "已开票",
  status_PARTIAL: "部分付款",
  status_PAID: "已付款",
  status_OVERDUE: "逾期",
  status_VOID: "作废",
  status_DELAYED: "延误",
  status_LATE: "逾期",
  status_WAIT: "等待",
  status_RISK: "风险",
  status_WATCH: "关注",
  status_DONE: "完成",
  status_PENDING: "待处理",
  status_APPROVED: "已批准",
};

const shellTh: Dict = {
  stage_booked: "จองแล้ว",
  stage_gatein: "ตู้เข้าท่า",
  stage_sailed: "ออกเรือ",
  stage_arrived: "ถึงท่า",
  stage_customs: "ผ่านพิธีการ",
  stage_delivered: "ส่งมอบ",
  viewCards: "แบบการ์ด",
  viewList: "แบบรายการ",
  navGroupHome: "หน้าหลัก",
  navGroupSales: "งานขาย",
  navGroupOps: "ปฏิบัติการ",
  navGroupFinance: "การเงิน",
  navGroupSystem: "ระบบ",
  navOverview: "ภาพรวม",
  navActionCenter: "งานที่ต้องจัดการ",
  navJobs: "งานขนส่ง",
  navReports: "รายงาน",
  quickCreate: "สร้างใหม่",
  quickNewQuote: "ใบเสนอราคาใหม่",
  quickNewJob: "งานขนส่งใหม่",
  quickNewCustomer: "ลูกค้าใหม่",
  quickNewLead: "ลูกค้าเป้าหมายใหม่",
  searchShort: "ค้นหา",
  account: "บัญชีผู้ใช้",
  collapseMenu: "ย่อเมนู",
  expandMenu: "ขยายเมนู",
  aiAsk: "สรุปด้วย AI",
  aiPanelTitle: "สรุปด้วย AI",
  aiRegenerate: "สร้างใหม่",
  filterAll: "ทั้งหมด",
  filterSearch: "ค้นหา…",
  clearFilters: "ล้างตัวกรอง",
  resultsCount: "{n} รายการ",
  noResults: "ไม่พบรายการที่ตรงกับตัวกรอง",
  noResultsHint: "ลองล้างตัวกรองหรือเปลี่ยนคำค้นหา",
  back: "ย้อนกลับ",
  status_DRAFT: "ฉบับร่าง",
  status_SENT: "ส่งแล้ว",
  status_ACCEPTED: "ลูกค้าตอบรับ",
  status_REJECTED: "ถูกปฏิเสธ",
  status_EXPIRED: "หมดอายุ",
  status_OPEN: "เปิดอยู่",
  status_IN_PROGRESS: "กำลังดำเนินการ",
  status_BOOKED: "จองระวางแล้ว",
  status_IN_TRANSIT: "ระหว่างขนส่ง",
  status_ARRIVED: "ถึงท่าแล้ว",
  status_DELIVERED: "ส่งมอบแล้ว",
  status_CLOSED: "ปิดงานแล้ว",
  status_CANCELLED: "ยกเลิก",
  status_ISSUED: "ออกแล้ว",
  status_UNBILLED: "ยังไม่วางบิล",
  status_INVOICED: "ออกใบแจ้งหนี้แล้ว",
  status_PARTIAL: "ชำระบางส่วน",
  status_PAID: "ชำระแล้ว",
  status_OVERDUE: "เกินกำหนด",
  status_VOID: "ยกเลิกเอกสาร",
  status_DELAYED: "ล่าช้า",
  status_LATE: "เกินกำหนด",
  status_WAIT: "รอ",
  status_RISK: "มีความเสี่ยง",
  status_WATCH: "เฝ้าระวัง",
  status_DONE: "เสร็จแล้ว",
  status_PENDING: "รอดำเนินการ",
  status_APPROVED: "อนุมัติแล้ว",
};

const shellEn: Dict = {
  stage_booked: "Booked",
  stage_gatein: "Gate-in",
  stage_sailed: "Sailed",
  stage_arrived: "Arrived",
  stage_customs: "Customs",
  stage_delivered: "Delivered",
  viewCards: "Card view",
  viewList: "List view",
  navGroupHome: "Home",
  navGroupSales: "Sales",
  navGroupOps: "Operations",
  navGroupFinance: "Finance",
  navGroupSystem: "System",
  navOverview: "Overview",
  navActionCenter: "Needs attention",
  navJobs: "Jobs",
  navReports: "Reports",
  quickCreate: "Create",
  quickNewQuote: "New quotation",
  quickNewJob: "New job",
  quickNewCustomer: "New customer",
  quickNewLead: "New lead",
  searchShort: "Search",
  account: "Account",
  collapseMenu: "Collapse menu",
  expandMenu: "Expand menu",
  aiAsk: "AI summary",
  aiPanelTitle: "AI summary",
  aiRegenerate: "Regenerate",
  filterAll: "All",
  filterSearch: "Search…",
  clearFilters: "Clear filters",
  resultsCount: "{n} results",
  noResults: "Nothing matches these filters",
  noResultsHint: "Try clearing filters or a different keyword.",
  back: "Back",
  status_DRAFT: "Draft",
  status_SENT: "Sent",
  status_ACCEPTED: "Accepted",
  status_REJECTED: "Rejected",
  status_EXPIRED: "Expired",
  status_OPEN: "Open",
  status_IN_PROGRESS: "In progress",
  status_BOOKED: "Booked",
  status_IN_TRANSIT: "In transit",
  status_ARRIVED: "Arrived",
  status_DELIVERED: "Delivered",
  status_CLOSED: "Closed",
  status_CANCELLED: "Cancelled",
  status_ISSUED: "Issued",
  status_UNBILLED: "Unbilled",
  status_INVOICED: "Invoiced",
  status_PARTIAL: "Partly paid",
  status_PAID: "Paid",
  status_OVERDUE: "Overdue",
  status_VOID: "Void",
  status_DELAYED: "Delayed",
  status_LATE: "Late",
  status_WAIT: "Waiting",
  status_RISK: "At risk",
  status_WATCH: "Watch",
  status_DONE: "Done",
  status_PENDING: "Pending",
  status_APPROVED: "Approved",
};

/*
 * Page books load lazily, one language at a time (the `?locale=` query is handled by the
 * i18n-locale-split plugin in vite.config.ts, which strips the other two languages).
 * main.tsx awaits the starting language before first render; setLocale awaits the next one.
 */
type PageLoaders = Record<string, () => Promise<Partial<Book>>>;
const pageLoaders: Record<keyof Book, PageLoaders> = {
  zh: import.meta.glob<Partial<Book>>("./i18n-pages/*.ts", { query: "?locale=zh", import: "default" }),
  th: import.meta.glob<Partial<Book>>("./i18n-pages/*.ts", { query: "?locale=th", import: "default" }),
  en: import.meta.glob<Partial<Book>>("./i18n-pages/*.ts", { query: "?locale=en", import: "default" }),
};

/** Merged page strings per language; filled by loadPageLocale. Read by t() in i18n.ts. */
export const pageDicts: Book = { zh: {}, th: {}, en: {} };
const pageLoads: Partial<Record<keyof Book, Promise<void>>> = {};

export function pageLocaleLoaded(locale: keyof Book): boolean {
  return Object.keys(pageDicts[locale]).length > 0;
}

export function loadPageLocale(locale: keyof Book): Promise<void> {
  pageLoads[locale] ??= Promise.all(Object.values(pageLoaders[locale]).map((load) => load()))
    .then((books) => {
      for (const book of books) Object.assign(pageDicts[locale], book[locale]);
    })
    .catch((err) => {
      delete pageLoads[locale];
      throw err;
    });
  return pageLoads[locale]!;
}

export const uiZh = shellZh;
export const uiTh = shellTh;
export const uiEn = shellEn;
