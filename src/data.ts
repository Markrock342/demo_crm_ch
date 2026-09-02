export type Direction = "in" | "out";
export type BoxStatus = "yard" | "sail" | "clear" | "hold" | "empty";
export type MailState = "open" | "sent" | "rejected";

export type Customer = {
  id: string;
  nameZh: string;
  nameTh: string;
  nameEn: string;
  cityZh: string;
  cityTh: string;
  cityEn: string;
  laneZh: string;
  laneTh: string;
  laneEn: string;
  boxes: number;
  owner: string;
  updated: string;
  arDays: number;
};

export type Box = {
  id: string;
  customerId: string;
  shipmentId?: string;
  type: string;
  dir: Direction;
  status: BoxStatus;
  yardZh: string;
  yardTh: string;
  yardEn: string;
  eta: string;
  teu: number;
  bl: string;
  vessel?: string;
  pol?: string;
  pod?: string;
  seal?: string;
  commodity?: string;
};

export type Mail = {
  id: string;
  customerId: string;
  from: string;
  subjectZh: string;
  subjectTh: string;
  subjectEn: string;
  bodyZh: string;
  bodyTh: string;
  bodyEn: string;
  draftZh: string;
  draftTh: string;
  draftEn: string;
  time: string;
  confidence: number;
  unread: boolean;
  state: MailState;
  intent?: string;
  summary?: string;
  origin?: string;
  dest?: string;
  extractedBoxes?: string[];
  docsMissing?: string[];
  suggestedStatus?: string;
  needsHuman?: boolean;
};

export const customers: Customer[] = [
  {
    id: "c1",
    nameZh: "深圳华运国际货运",
    nameTh: "หัวหยุน เซินเจิ้น",
    nameEn: "Shenzhen Huayun Freight",
    cityZh: "深圳",
    cityTh: "เซินเจิ้น",
    cityEn: "Shenzhen",
    laneZh: "盐田 → 林查班",
    laneTh: "หยานเถียน → แหลมฉบัง",
    laneEn: "Yantian → Laem Chabang",
    boxes: 14,
    owner: "周可",
    updated: "09-02",
    arDays: 12,
  },
  {
    id: "c2",
    nameZh: "宁波港泰供应链",
    nameTh: "กั่งไท หนิงโป",
    nameEn: "Ningbo Gangtai Supply",
    cityZh: "宁波",
    cityTh: "หนิงโป",
    cityEn: "Ningbo",
    laneZh: "北仑 → 曼谷",
    laneTh: "เป่ยหลุน → กรุงเทพ",
    laneEn: "Beilun → Bangkok",
    boxes: 9,
    owner: "林晓衡",
    updated: "09-01",
    arDays: 6,
  },
  {
    id: "c3",
    nameZh: "青岛中泰物流",
    nameTh: "จงไท ชิงเต่า",
    nameEn: "Qingdao Zhongtai Logistics",
    cityZh: "青岛",
    cityTh: "ชิงเต่า",
    cityEn: "Qingdao",
    laneZh: "前湾 → 林查班",
    laneTh: "เฉียนวาน → แหลมฉบัง",
    laneEn: "Qianwan → Laem Chabang",
    boxes: 7,
    owner: "马思远",
    updated: "08-28",
    arDays: 41,
  },
  {
    id: "c4",
    nameZh: "广州南沙联运",
    nameTh: "หนานซา ล้วนหยุ่น",
    nameEn: "Guangzhou Nansha Intermodal",
    cityZh: "广州",
    cityTh: "กว่างโจว",
    cityEn: "Guangzhou",
    laneZh: "南沙 → 林查班",
    laneTh: "หนานซา → แหลมฉบัง",
    laneEn: "Nansha → Laem Chabang",
    boxes: 11,
    owner: "周可",
    updated: "09-02",
    arDays: 3,
  },
  {
    id: "c5",
    nameZh: "义乌出海仓",
    nameTh: "คลังออกทะเล อี้อู",
    nameEn: "Yiwu Outbound Warehouse",
    cityZh: "义乌",
    cityTh: "อี้อู",
    cityEn: "Yiwu",
    laneZh: "义乌 → 北榄仓",
    laneTh: "อี้อู → คลังสมุทรปราการ",
    laneEn: "Yiwu → Samut Prakan",
    boxes: 22,
    owner: "陈一宁",
    updated: "09-02",
    arDays: 18,
  },
  {
    id: "c6",
    nameZh: "东莞联胜货代",
    nameTh: "เหลียนเซิ่ง ตงกวน",
    nameEn: "Dongguan Liansheng Forwarding",
    cityZh: "东莞",
    cityTh: "ตงกวน",
    cityEn: "Dongguan",
    laneZh: "虎门 → 罗勇",
    laneTh: "หูเหมิน → ระยอง",
    laneEn: "Humen → Rayong",
    boxes: 5,
    owner: "陈一宁",
    updated: "08-30",
    arDays: 9,
  },
  {
    id: "c7",
    nameZh: "上海东盟航运",
    nameTh: "อาเซียน เซี่ยงไฮ้",
    nameEn: "Shanghai ASEAN Shipping",
    cityZh: "上海",
    cityTh: "เซี่ยงไฮ้",
    cityEn: "Shanghai",
    laneZh: "外高桥 → 曼谷",
    laneTh: "ไว่เกาเฉียว → กรุงเทพ",
    laneEn: "Waigaoqiao → Bangkok",
    boxes: 4,
    owner: "林晓衡",
    updated: "08-27",
    arDays: 21,
  },
  {
    id: "c8",
    nameZh: "林查班泰华仓储",
    nameTh: "คลังไทย–จีน แหลมฉบัง",
    nameEn: "Laem Chabang Taihua Yard",
    cityZh: "林查班",
    cityTh: "แหลมฉบัง",
    cityEn: "Laem Chabang",
    laneZh: "堆场周转",
    laneTh: "หมุนเวียนลาน",
    laneEn: "Yard turn",
    boxes: 31,
    owner: "马思远",
    updated: "09-02",
    arDays: 0,
  },
  {
    id: "c9",
    nameZh: "罗勇泰出食品",
    nameTh: "ระยองไทยฟู้ด",
    nameEn: "Rayong Thai Food Export",
    cityZh: "罗勇",
    cityTh: "ระยอง",
    cityEn: "Rayong",
    laneZh: "林查班 → 盐田",
    laneTh: "แหลมฉบัง → หยานเถียน",
    laneEn: "Laem Chabang → Yantian",
    boxes: 6,
    owner: "林晓衡",
    updated: "09-02",
    arDays: 5,
  },
  {
    id: "c10",
    nameZh: "北榄树胶出口",
    nameTh: "ยางสมุทรปราการ",
    nameEn: "Samut Prakan Latex Export",
    cityZh: "北榄",
    cityTh: "สมุทรปราการ",
    cityEn: "Samut Prakan",
    laneZh: "林查班 → 宁波",
    laneTh: "แหลมฉบัง → หนิงโป",
    laneEn: "Laem Chabang → Ningbo",
    boxes: 8,
    owner: "陈一宁",
    updated: "09-01",
    arDays: 11,
  },
];

export const boxes: Box[] = [
  { id: "MSCU4829103", customerId: "c1", shipmentId: "s3", type: "40HC", dir: "out", status: "sail", yardZh: "盐田三期", yardTh: "หยานเถียน 3", yardEn: "Yantian T3", eta: "09-06", teu: 2, bl: "SHZ25090281", vessel: "MSC LONDON", pol: "CNYTN", pod: "THLCH", seal: "ML-CN882901", commodity: "家具" },
  { id: "COSU7193348", customerId: "c4", shipmentId: "s1", type: "20GP", dir: "out", status: "hold", yardZh: "南沙一期", yardTh: "หนานซา 1", yardEn: "Nansha T1", eta: "09-04", teu: 1, bl: "NSA25082911", vessel: "COSCO SHIPPING ARIES", pol: "CNNSA", pod: "THLCH", seal: "CS-771902", commodity: "机械配件" },
  { id: "OOLU2611084", customerId: "c2", type: "40HC", dir: "in", status: "yard", yardZh: "林查班 B4", yardTh: "แหลมฉบัง B4", yardEn: "LCB B4", eta: "09-02", teu: 2, bl: "NGB25081844", pol: "CNNGB", pod: "THLCH", commodity: "塑料粒" },
  { id: "EMCU9037712", customerId: "c5", shipmentId: "s5", type: "40HC", dir: "out", status: "sail", yardZh: "义乌监管仓", yardTh: "คลังศุลกากรอี้อู", yardEn: "Yiwu bonded", eta: "09-08", teu: 2, bl: "YIW25090102", vessel: "CMA CGM THALASSA", pol: "CNNGB", pod: "THBKK", commodity: "小商品" },
  { id: "TEMU5541209", customerId: "c3", shipmentId: "s6", type: "20GP", dir: "in", status: "hold", yardZh: "林查班 C1", yardTh: "แหลมฉบัง C1", yardEn: "LCB C1", eta: "08-29", teu: 1, bl: "TAO25080177", vessel: "PIL BANGKOK", pol: "CNTAO", pod: "THLCH", commodity: "化工" },
  { id: "CMAU3382106", customerId: "c6", type: "40HC", dir: "out", status: "clear", yardZh: "虎门驳运", yardTh: "ฮูเหมิน เรือลำเลียง", yardEn: "Humen barge", eta: "09-03", teu: 2, bl: "DGN25082209", pol: "CNHMN", pod: "THRYG", commodity: "电子" },
  { id: "TCLU8820145", customerId: "c8", type: "40HC", dir: "in", status: "empty", yardZh: "林查班空箱区", yardTh: "โซนตู้เปล่า ลฉบ.", yardEn: "LCB empty", eta: "09-01", teu: 2, bl: "LCB25083001", pol: "THLCH", pod: "THLCH" },
  { id: "FCIU1479033", customerId: "c7", type: "20GP", dir: "in", status: "yard", yardZh: "林查班 D2", yardTh: "แหลมฉบัง D2", yardEn: "LCB D2", eta: "09-02", teu: 1, bl: "SHA25081560", pol: "CNSHA", pod: "THLCH", commodity: "棉纱" },
  { id: "GESU6108821", customerId: "c1", shipmentId: "s3", type: "40HC", dir: "out", status: "yard", yardZh: "盐田堆存", yardTh: "ลานหยานเถียน", yardEn: "Yantian yard", eta: "09-05", teu: 2, bl: "SHZ25090281", vessel: "MSC LONDON", pol: "CNYTN", pod: "THLCH", seal: "ML-CN882902", commodity: "家具" },
  { id: "HLXU2299017", customerId: "c4", shipmentId: "s1", type: "40HC", dir: "out", status: "hold", yardZh: "南沙待补", yardTh: "หนานซารอเอกสาร", yardEn: "Nansha hold", eta: "09-04", teu: 2, bl: "NSA25083022", vessel: "COSCO SHIPPING ARIES", pol: "CNNSA", pod: "THLCH", seal: "CS-771903", commodity: "机械配件" },
  { id: "MSCU9012284", customerId: "c5", shipmentId: "s5", type: "20GP", dir: "out", status: "sail", yardZh: "义乌拼箱", yardTh: "LCL อี้อู", yardEn: "Yiwu LCL", eta: "09-07", teu: 1, bl: "YIW25082755", vessel: "CMA CGM THALASSA", pol: "CNNGB", pod: "THBKK", commodity: "小商品" },
  { id: "COSU4410876", customerId: "c2", type: "40HC", dir: "in", status: "clear", yardZh: "北榄仓", yardTh: "คลังสมุทรปราการ", yardEn: "Samut Prakan", eta: "08-31", teu: 2, bl: "NGB25080103", pol: "CNNGB", pod: "THBKK", commodity: "塑料粒" },
  { id: "TCLU3308812", customerId: "c9", shipmentId: "s2", type: "40HC", dir: "out", status: "hold", yardZh: "林查班 A2", yardTh: "แหลมฉบัง A2", yardEn: "LCB A2", eta: "09-05", teu: 2, bl: "LCB25090201", vessel: "ONE COMMITMENT", pol: "THLCH", pod: "CNYTN", seal: "ONE-330881", commodity: "冷冻食品" },
  { id: "MSCU2201198", customerId: "c9", shipmentId: "s2", type: "40HC", dir: "out", status: "sail", yardZh: "林查班码头", yardTh: "ท่าเรือแหลมฉบัง", yardEn: "LCB berth", eta: "09-04", teu: 2, bl: "LCB25082844", vessel: "ONE COMMITMENT", pol: "THLCH", pod: "CNYTN", commodity: "冷冻食品" },
  { id: "OOLU8844011", customerId: "c10", type: "20GP", dir: "out", status: "yard", yardZh: "林查班 B1", yardTh: "แหลมฉบัง B1", yardEn: "LCB B1", eta: "09-07", teu: 1, bl: "LCB25090155", pol: "THLCH", pod: "CNNGB", commodity: "树胶" },
];

export const mailsSeed: Mail[] = [
  {
    id: "m1",
    customerId: "c4",
    from: "ops@nansha-lianyun.cn",
    subjectZh: "南沙四柜产地证还缺两份",
    subjectTh: "ใบรับรองแหล่งกำเนิดตู้หนานซา ยังขาดอีกสอง",
    subjectEn: "Two C/O still missing for the Nansha boxes",
    bodyZh:
      "林经理：南沙本航次 COSU7193348、HLXU2299017 产地证海关未收齐。请确认工厂能否今天下午补扫件，否则船期顺延到下周二。",
    bodyTh:
      "คุณหลิน: เที่ยวหนานซาตู้ COSU7193348 กับ HLXU2299017 ศุลกากรยังไม่ครบใบรับรองแหล่งกำเนิด โรงงานสแกนส่งบ่ายนี้ได้ไหม ไม่งั้นเลื่อนไปอังคารหน้า",
    bodyEn:
      "Lin: Nansha sailing, COSU7193348 and HLXU2299017 — customs still missing C/O. Can the factory scan this afternoon, or we roll to next Tuesday.",
    draftZh:
      "收到。两柜产地证我们今天下午 16:00 前补传到单一窗口，并抄送贵司操作。若 16:00 仍未齐，我们按贵司意见改配下周二南沙班轮，柜费与堆存按原约定由我司先垫、月底对账。",
    draftTh:
      "ได้รับแล้ว ส่งใบรับรองสองตู้เข้าหน้าต่างเดียวภายใน 16:00 วันนี้ และสำเนาให้ฝ่ายปฏิบัติการของท่าน ถ้ายังไม่ครบ จะย้ายไปรอบอังคารหนานซาตามที่ท่านแจ้ง ค่าตู้กับค่าลานเราตั้งสำรองก่อน เคลียร์สิ้นเดือน",
    draftEn:
      "Received. We will file both C/Os to the single window before 16:00 today and cc your ops desk. If they are still short, we roll to next Tuesday’s Nansha sailing as you asked. Box and dwell we advance; we settle at month-end.",
    time: "14:22",
    confidence: 0.86,
    unread: true,
    state: "open",
  },
  {
    id: "m2",
    customerId: "c5",
    from: "export@yiwu-cang.com",
    subjectZh: "北榄仓还能收几柜小商品",
    subjectTh: "คลังสมุทรปราการรับตู้สินค้าเล็กได้อีกกี่ตู้",
    subjectEn: "How many more Yiwu boxes can Samut Prakan take",
    bodyZh:
      "请问北榄仓这周还能进几只 40HC？我们义乌这边还有 8 柜待装，怕压船。要不要先分 4 柜走林查班直航？",
    bodyTh:
      "คลังสมุทรปราการสัปดาห์นี้รับ 40HC ได้อีกกี่ตู้ ที่อี้อูมีอีก 8 ตู้รอโหลด กลัวเรือเต็ม แยก 4 ตู้ไปแหลมฉบังตรงได้ไหม",
    bodyEn:
      "How many more 40HC can Samut Prakan take this week? We still have 8 boxes in Yiwu and are worried about the cut-off. Split 4 onto the Laem Chabang direct?",
    draftZh:
      "北榄本周还能收 5×40HC。建议：5 柜进北榄（本周五截关），余下 3 柜改林查班周日班轮，避免义乌内陆堆存。两套舱位我先锁到明天 10:00，请回复确认柜号。",
    draftTh:
      "คลังสมุทรปราการรับได้อีก 5×40HC สัปดาห์นี้ เสนอ: 5 ตู้เข้าคลัง (ปิดรับศุกร์นี้) อีก 3 ตู้ย้ายไปรอบอาทิตย์แหลมฉบัง จะได้ไม่กองที่อี้อู ล็อกระวางถึง 10:00 พรุ่งนี้นะ ตอบเลขตู้มา",
    draftEn:
      "Samut Prakan can still take five 40HC this week. Proposal: 5 into the warehouse (Friday cut-off), 3 onto Sunday’s Laem Chabang sailing so they do not dwell inland at Yiwu. Space held until 10:00 tomorrow — reply with box numbers.",
    time: "11:04",
    confidence: 0.79,
    unread: true,
    state: "open",
  },
  {
    id: "m3",
    customerId: "c3",
    from: "finance@qd-zhongtai.com",
    subjectZh: "八月账单请再发一回",
    subjectTh: "ขอใบวางบิลสิงหาคมอีกครั้ง",
    subjectEn: "Please resend the August statement",
    bodyZh:
      "财务没收到八月对账单。柜量我们这边记的是 7，和贵司是否一致？收到后本周内安排付款。",
    bodyTh:
      "การเงินยังไม่ได้รับใบกระทบยอดสิงหาคม ฝั่งเรานับ 7 ตู้ ตรงกับคุณไหม ได้แล้วจะโอนในสัปดาห์นี้",
    bodyEn:
      "Finance never received the August statement. We have 7 boxes on our side — does that match? We will pay this week once it arrives.",
    draftZh:
      "八月对账已重发到 finance@qd-zhongtai.com，抄送马思远。柜量 7，与贵司一致：进口 4、出口 3。账龄已 41 天，烦请本周内安排，回执发我即可。",
    draftTh:
      "ส่งใบสิงหาคมไป finance@qd-zhongtai.com แล้ว สำเนาหม่าซือหยวน ตู้ 7 ตรงกัน: นำเข้า 4 ส่งออก 3 ค้าง 41 วันแล้ว รบกวนโอนในสัปดาห์นี้ ตอบใบเสร็จมาได้",
    draftEn:
      "August statement resent to finance@qd-zhongtai.com, cc Ma Siyuan. Box count 7, matching you: 4 in, 3 out. Age is 41 days — please remit this week and send the receipt.",
    time: "09:40",
    confidence: 0.91,
    unread: false,
    state: "open",
  },
  {
    id: "m4",
    customerId: "c1",
    from: "booking@huayun-sz.cn",
    subjectZh: "盐田加一柜家具，能不能赶上 9/6",
    subjectTh: "หยานเถียนเพิ่มตู้เฟอร์นิเจอร์ ตาม 6 ก.ย. ได้ไหม",
    subjectEn: "One extra furniture box at Yantian — can it catch 6 Sep",
    bodyZh:
      "客户临时加一只 40HC 家具。现有 MSCU4829103 已在途。新柜能不能挤进 6 日船？超重大概 1.2 吨。",
    bodyTh:
      "ลูกค้าเพิ่ม 40HC เฟอร์นิเจอร์กะทันหัน ตู้ MSCU4829103 ออกแล้ว ตู้ใหม่เบียดรอบวันที่ 6 ได้ไหม น้ำหนักเกินราว 1.2 ตัน",
    bodyEn:
      "Customer added one 40HC of furniture. MSCU4829103 is already underway. Can the extra box make the 6th? About 1.2 t overweight.",
    draftZh:
      "6 日船已截重。超重 1.2 吨过船公司限额，不能硬挤。可配 9 日盐田加班轮，或改驳到南沙 8 日班。两方案我都留舱到今晚 18:00。",
    draftTh:
      "รอบวันที่ 6 ปิดน้ำหนักแล้ว เกิน 1.2 ตันเกินเพดานสายเรือ เบียดไม่ได้ เลือกได้: รอบพิเศษหยานเถียนวันที่ 9 หรือเปลี่ยนไปหนานซาวันที่ 8 จองไว้ถึง 18:00 วันนี้",
    draftEn:
      "The 6th is already cut for weight. 1.2 t over the line’s limit — we cannot force it. Options: Yantian extra loader on the 9th, or barge to Nansha on the 8th. Both held until 18:00 today.",
    time: "昨 17:15",
    confidence: 0.83,
    unread: false,
    state: "open",
  },
  {
    id: "m5",
    customerId: "c9",
    from: "export@rayong-food.co.th",
    subjectZh: "TCLU3308812 产地证还没到，盐田会卡吗",
    subjectTh: "TCLU3308812 ใบรับรองแหล่งกำเนิดยังไม่มา หยานเถียนจะค้างไหม",
    subjectEn: "TCLU3308812 C/O still missing — will Yantian hold it",
    bodyZh:
      "林经理：罗勇这票冷冻食品 TCLU3308812，提单 LCB25090201，林查班已进场。中国海关要产地证，工厂说今天下午才出扫描件。能不能先配盐田周五班？还是必须等证到了再放。",
    bodyTh:
      "คุณหลิน: ตู้เย็นอาหารระยอง TCLU3308812 ใบตราส่ง LCB25090201 เข้าลานแหลมฉบังแล้ว จีนขอใบรับรองแหล่งกำเนิด โรงงานบอกบ่ายนี้ถึงมีไฟล์ จะเบียดรอบศุกร์หยานเถียนได้ไหม หรือต้องรอใบก่อน",
    bodyEn:
      "Lin: Rayong frozen food TCLU3308812, B/L LCB25090201, already on the LCB yard. China customs wants the C/O. Factory says scan this afternoon. Can it still catch Friday Yantian, or must we wait for the paper?",
    draftZh: "",
    draftTh: "",
    draftEn: "",
    time: "15:10",
    confidence: 0,
    unread: true,
    state: "open",
    needsHuman: true,
  },
  {
    id: "m6",
    customerId: "c10",
    from: "booking@splatex.co.th",
    subjectZh: "北榄胶还能加两柜走宁波吗",
    subjectTh: "ยางสมุทรปราการ เพิ่มอีกสองตู้ไปหนิงโปได้ไหม",
    subjectEn: "Can Samut Prakan latex add two more boxes to Ningbo",
    bodyZh:
      "现有 OOLU8844011 一只 20GP 在林查班。客户要再加两只 40HC 去宁波北仑，下周三截关。舱位还有没有？",
    bodyTh:
      "มี OOLU8844011 เป็น 20GP อยู่แหลมฉบัง ลูกค้าจะเพิ่ม 40HC อีกสองตู้ไปเป่ยหลุนหนิงโป ปิดรับพุธหน้า ยังมีระวางไหม",
    bodyEn:
      "We already have OOLU8844011, a 20GP, at LCB. Customer wants two more 40HC to Beilun, Ningbo, Wednesday cut-off. Any space?",
    draftZh: "",
    draftTh: "",
    draftEn: "",
    time: "13:48",
    confidence: 0,
    unread: true,
    state: "open",
    needsHuman: true,
  },
];

export const laneWeek = [
  { port: "林查出", portTh: "ลฉบ.ออก", portEn: "LCB export", teu: 24 },
  { port: "盐田", portTh: "หยานเถียน", portEn: "Yantian", teu: 28 },
  { port: "宁波", portTh: "หนิงโป", portEn: "Ningbo", teu: 19 },
  { port: "南沙", portTh: "หนานซา", portEn: "Nansha", teu: 16 },
  { port: "青岛", portTh: "ชิงเต่า", portEn: "Qingdao", teu: 9 },
];

export function customerName(c: Customer, locale: "zh" | "th" | "en") {
  if (locale === "th") return c.nameTh;
  if (locale === "en") return c.nameEn;
  return c.nameZh;
}

export function cityName(c: Customer, locale: "zh" | "th" | "en") {
  if (locale === "th") return c.cityTh;
  if (locale === "en") return c.cityEn;
  return c.cityZh;
}

export function laneName(c: Customer, locale: "zh" | "th" | "en") {
  if (locale === "th") return c.laneTh;
  if (locale === "en") return c.laneEn;
  return c.laneZh;
}

export function yardName(b: Box, locale: "zh" | "th" | "en") {
  if (locale === "th") return b.yardTh;
  if (locale === "en") return b.yardEn;
  return b.yardZh;
}

export function findCustomer(id: string) {
  return customers.find((c) => c.id === id);
}
