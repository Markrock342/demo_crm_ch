/**
 * Sample (demo / seed) content translations.
 *
 * The demo data and the live DB seed store their sample text in Chinese (task titles, owners,
 * lead companies, deal titles, contact names…). Stored values stay Chinese — they are the keys
 * here — and the UI shows the Thai / English wording at render time. Anything not in the
 * dictionary (i.e. text a user typed) is shown exactly as stored.
 *
 * Kept free of React / store imports so seed modules can use it; the hook lives in useDemoText.ts.
 */
import type { Locale } from "../../i18n";

type Tr = { th: string; en: string };

/** Place names used inside lanes ("林查班 → 南沙"), yard labels and cities. */
const PLACES: Record<string, Tr> = {
  林查班: { th: "แหลมฉบัง", en: "Laem Chabang" },
  林查: { th: "แหลมฉบัง", en: "Laem Chabang" },
  曼谷: { th: "กรุงเทพฯ", en: "Bangkok" },
  北榄: { th: "สมุทรปราการ", en: "Samut Prakan" },
  北榄仓: { th: "คลังสมุทรปราการ", en: "Samut Prakan warehouse" },
  罗勇: { th: "ระยอง", en: "Rayong" },
  宋卡: { th: "สงขลา", en: "Songkhla" },
  春武里: { th: "ชลบุรี", en: "Chonburi" },
  合艾: { th: "หาดใหญ่", en: "Hat Yai" },
  上海: { th: "เซี่ยงไฮ้", en: "Shanghai" },
  外高桥: { th: "ไว่เกาเฉียว", en: "Waigaoqiao" },
  宁波: { th: "หนิงโป", en: "Ningbo" },
  北仑: { th: "เป่ยหลุน", en: "Beilun" },
  盐田: { th: "หยานเถียน", en: "Yantian" },
  深圳: { th: "เซินเจิ้น", en: "Shenzhen" },
  蛇口: { th: "เสอโข่ว", en: "Shekou" },
  南沙: { th: "หนานซา", en: "Nansha" },
  广州: { th: "กว่างโจว", en: "Guangzhou" },
  黄埔: { th: "หวงผู่", en: "Huangpu" },
  佛山: { th: "ฝอซาน", en: "Foshan" },
  东莞: { th: "ตงกวน", en: "Dongguan" },
  虎门: { th: "หู่เหมิน", en: "Humen" },
  青岛: { th: "ชิงเต่า", en: "Qingdao" },
  前湾: { th: "เฉียนวาน", en: "Qianwan" },
  义乌: { th: "อี้อู", en: "Yiwu" },
  厦门: { th: "เซี่ยเหมิน", en: "Xiamen" },
  天津: { th: "เทียนจิน", en: "Tianjin" },
  香港: { th: "ฮ่องกง", en: "Hong Kong" },
  新加坡: { th: "สิงคโปร์", en: "Singapore" },
  胡志明: { th: "โฮจิมินห์", en: "Ho Chi Minh" },
  海防: { th: "ไฮฟอง", en: "Haiphong" },
  巴生: { th: "พอร์ตกลัง", en: "Port Klang" },
  盐田三期: { th: "หยานเถียน เฟส 3", en: "Yantian Phase 3" },
  盐田堆存: { th: "ลานตู้หยานเถียน", en: "Yantian yard" },
  南沙一期: { th: "หนานซา เฟส 1", en: "Nansha Phase 1" },
  南沙待补: { th: "หนานซา (รอเอกสาร)", en: "Nansha (awaiting documents)" },
  义乌监管仓: { th: "คลังทัณฑ์บนอี้อู", en: "Yiwu bonded warehouse" },
  义乌拼箱: { th: "คลังรวมสินค้าอี้อู (CFS)", en: "Yiwu CFS" },
  虎门驳运: { th: "เรือลำเลียงหู่เหมิน", en: "Humen barge" },
  林查班空箱区: { th: "ลานตู้เปล่า แหลมฉบัง", en: "Laem Chabang empty yard" },
  林查班码头: { th: "ท่าเรือแหลมฉบัง", en: "Laem Chabang quay" },
  堆场周转: { th: "หมุนเวียนตู้ในลาน", en: "Yard turnover" },
};

/** Staff and contact names: Thai transliteration + pinyin. */
const PEOPLE: Record<string, Tr> = {
  // staff (same as server/services/auth.service.ts seed users)
  林晓衡: { th: "หลิน เสี่ยวเหิง", en: "Lin Xiaoheng" },
  周可: { th: "โจว เข่อ", en: "Zhou Ke" },
  陈一宁: { th: "เฉิน อี้หนิง", en: "Chen Yining" },
  马思远: { th: "หม่า ซือหยวน", en: "Ma Siyuan" },
  "纳帕·西苏": { th: "ณภัทร ศรีสุข", en: "Napat Srisuk" },
  "诗丽蓬·旺萨功": { th: "ศิริพร วงศ์สกุล", en: "Siriporn Wongsakul" },
  // demo-mode desks (src/adapters/stub/auth.stub.ts)
  销售席: { th: "ฝ่ายขาย", en: "Sales desk" },
  操作席: { th: "ฝ่ายปฏิบัติการ", en: "Ops desk" },
  财务席: { th: "ฝ่ายบัญชี-การเงิน", en: "Finance desk" },
  管理席: { th: "ผู้ดูแลระบบ", en: "Admin desk" },
  // demo-mode job owners (src/shell/seedLcs.ts)
  陈销售: { th: "เฉิน (ฝ่ายขาย)", en: "Chen (Sales)" },
  王销售: { th: "หวัง (ฝ่ายขาย)", en: "Wang (Sales)" },
  李销售: { th: "หลี่ (ฝ่ายขาย)", en: "Li (Sales)" },
  张销售: { th: "จาง (ฝ่ายขาย)", en: "Zhang (Sales)" },
  赵操作: { th: "จ้าว (ปฏิบัติการ)", en: "Zhao (Ops)" },
  钱操作: { th: "เฉียน (ปฏิบัติการ)", en: "Qian (Ops)" },
  孙操作: { th: "ซุน (ปฏิบัติการ)", en: "Sun (Ops)" },
  // customer contacts (src/crm.ts)
  赵海宁: { th: "จ้าว ไห่หนิง", en: "Zhao Haining" },
  陈可: { th: "เฉิน เข่อ", en: "Chen Ke" },
  吴南: { th: "อู๋ หนาน", en: "Wu Nan" },
  金小义: { th: "จิน เสี่ยวอี้", en: "Jin Xiaoyi" },
  何北仑: { th: "เหอ เป่ยหลุน", en: "He Beilun" },
  李卫东: { th: "หลี่ เว่ยตง", en: "Li Weidong" },
  王建华: { th: "หวัง เจี้ยนหัว", en: "Wang Jianhua" },
  刘晓东: { th: "หลิว เสี่ยวตง", en: "Liu Xiaodong" },
  梁志明: { th: "เหลียง จื้อหมิง", en: "Liang Zhiming" },
  孙丽: { th: "ซุน ลี่", en: "Sun Li" },
};

/** Everything else: companies, job titles, lead sources, deal / task / activity / document text, commodities. */
const TEXT: Record<string, Tr> = {
  // contact job titles
  操作经理: { th: "ผู้จัดการฝ่ายปฏิบัติการ", en: "Operations manager" },
  商务: { th: "ฝ่ายขายและ Booking", en: "Sales & booking" },
  单证: { th: "เจ้าหน้าที่เอกสาร", en: "Documentation" },
  财务: { th: "ฝ่ายบัญชี-การเงิน", en: "Finance" },
  仓配: { th: "คลังสินค้าและจัดส่ง", en: "Warehouse & distribution" },
  调度: { th: "ผู้ประสานงานจัดส่ง", en: "Dispatcher" },
  操作: { th: "ฝ่ายปฏิบัติการ", en: "Operations" },

  // lead companies + sources
  春武里木业: { th: "ชลบุรี ค้าไม้", en: "Chonburi Timber" },
  罗勇石化包装: { th: "ระยอง ปิโตรเคมีบรรจุภัณฑ์", en: "Rayong Petrochem Packaging" },
  北榄冷链: { th: "สมุทรปราการ ห้องเย็น", en: "Samut Prakan Cold Chain" },
  宋卡橡胶二厂: { th: "ยางสงขลา โรงงาน 2", en: "Songkhla Rubber Plant 2" },
  协会: { th: "สมาคมการค้า", en: "Trade association" },
  转介: { th: "ลูกค้าแนะนำ", en: "Referral" },
  邮件: { th: "อีเมล", en: "Email" },
  展会: { th: "งานแสดงสินค้า", en: "Trade show" },
  官网: { th: "เว็บไซต์", en: "Website" },
  曼谷精密五金: { th: "บางกอก พรีซิชั่น ฮาร์ดแวร์", en: "Bangkok Precision Hardware" },
  春武里汽车配件: { th: "ชลบุรี ชิ้นส่วนยานยนต์", en: "Chonburi Auto Components" },
  罗勇家电组装: { th: "ระยอง ประกอบเครื่องใช้ไฟฟ้า", en: "Rayong Appliance Assembly" },
  合艾海产出口: { th: "หาดใหญ่ อาหารทะเลส่งออก", en: "Hat Yai Seafood Export" },
  泰国瓷砖进口: { th: "ไทย กระเบื้องนำเข้า", en: "Thai Tile Import" },
  北榄电子仓储: { th: "สมุทรปราการ คลังอิเล็กทรอนิกส์", en: "Samut Prakan Electronics Warehousing" },
  宋卡木薯淀粉: { th: "สงขลา แป้งมันสำปะหลัง", en: "Songkhla Tapioca Starch" },
  泰国宠物食品: { th: "ไทย อาหารสัตว์เลี้ยง", en: "Thai Pet Food" },

  // deals
  "冷冻食品 6×40HC 盐田": { th: "อาหารแช่แข็ง 6×40HC หยานเถียน", en: "Frozen food 6×40HC Yantian" },
  "树胶 8×20GP 宁波": { th: "ยางพารา 8×20GP หนิงโป", en: "Natural rubber 8×20GP Ningbo" },
  "家具回程 4×40HC": { th: "เฟอร์นิเจอร์ขากลับ 4×40HC", en: "Furniture backhaul 4×40HC" },
  义乌拼箱周班: { th: "LCL อี้อู รายสัปดาห์", en: "Yiwu weekly LCL" },
  南沙产地证滞留: { th: "ตู้หนานซาค้างรอ C/O", en: "Nansha boxes held for C/O" },
  青岛化工柜续约: { th: "ต่อสัญญาตู้เคมีชิงเต่า", en: "Qingdao chemical boxes renewal" },
  上海棉纱月度合约: { th: "สัญญารายเดือน เส้นด้ายฝ้ายเซี่ยงไฮ้", en: "Shanghai cotton yarn monthly contract" },
  宁波塑料粒季度标: { th: "ประมูลรายไตรมาส เม็ดพลาสติกหนิงโป", en: "Ningbo plastic pellets quarterly tender" },
  东莞电子旺季加舱: { th: "เพิ่มระวางช่วงพีค อิเล็กทรอนิกส์ตงกวน", en: "Dongguan electronics peak-season space" },
  空箱回运年度协议: { th: "สัญญารายปี ส่งตู้เปล่ากลับ", en: "Annual empty repositioning agreement" },
  青岛化工新品试单: { th: "ทดลองส่งเคมีภัณฑ์ใหม่ ชิงเต่า", en: "Qingdao new chemical trial shipment" },
  盐田家具九月加柜: { th: "เพิ่มตู้เฟอร์นิเจอร์หยานเถียน ก.ย.", en: "Yantian furniture extra boxes (Sep)" },
  冷冻虾旺季包舱: { th: "เหมาระวางกุ้งแช่แข็งช่วงพีค", en: "Frozen shrimp peak-season block space" },

  // tasks
  "催 TCLU3308812 产地证扫描件": { th: "ตามสแกน C/O ของ TCLU3308812", en: "Chase C/O scan for TCLU3308812" },
  回南沙两柜补件邮件: { th: "ตอบอีเมลขอเอกสารเพิ่ม 2 ตู้หนานซา", en: "Reply to Nansha email on missing docs for 2 boxes" },
  青岛中泰八月对账回执: { th: "ขอคำยืนยันใบกระทบยอดเดือน ส.ค. จงไท่ ชิงเต่า", en: "Get Qingdao Zhongtai August statement confirmation" },
  "北榄胶加柜报价两只 40HC": { th: "เสนอราคาเพิ่ม 40HC 2 ตู้ ยางสมุทรปราการ", en: "Quote 2 extra 40HC for Samut Prakan Rubber" },
  空箱回运宁波舱位: { th: "จองระวางส่งตู้เปล่ากลับหนิงโป", en: "Book space for empties back to Ningbo" },
  协会见面纪要归档: { th: "เก็บบันทึกการพบสมาคมเข้าแฟ้ม", en: "File the association meeting notes" },
  催收华运六月运费尾款: { th: "ติดตามยอดค้างค่าระวางเดือน มิ.ย. หัวหยุน", en: "Chase Huayun's outstanding June freight balance" },
  预约南沙到港两柜海关查验: { th: "นัดศุลกากรตรวจ 2 ตู้จากหนานซาที่ถึงท่าแล้ว", en: "Book customs inspection for the 2 arrived Nansha boxes" },
  上海东盟对账单寄出: { th: "ส่งใบแจ้งยอด เซี่ยงไฮ้ อาเซียน", en: "Send statement to Shanghai ASEAN" },
  罗勇冷冻柜预冷确认: { th: "ยืนยันพรีคูลตู้เย็นระยอง", en: "Confirm pre-cooling of Rayong reefers" },
  义乌周班舱位锁定: { th: "ล็อกระวางรอบรายสัปดาห์อี้อู", en: "Lock space on the Yiwu weekly sailing" },
  蛇口家具柜安排派送: { th: "จัดส่งตู้เฟอร์นิเจอร์จากเสอโข่ว", en: "Arrange delivery of the Shekou furniture box" },
  "青岛化工 MSDS 归档": { th: "เก็บ MSDS เคมีภัณฑ์ชิงเต่าเข้าแฟ้ม", en: "File the Qingdao chemicals MSDS" },
  东莞电子旺季报价复核: { th: "ทบทวนใบเสนอราคาช่วงพีค อิเล็กทรอนิกส์ตงกวน", en: "Review peak-season quote for Dongguan electronics" },
  补传南沙两柜产地证: { th: "ส่ง C/O ของ 2 ตู้หนานซาเพิ่มเติม", en: "Upload the missing C/Os for the 2 Nansha boxes" },
  "跟进 MSC 延误新 ETA": { th: "ติดตาม ETA ใหม่ของ MSC ที่ล่าช้า", en: "Chase MSC for the revised ETA" },
  通知上海东盟船期延误: { th: "แจ้งเซี่ยงไฮ้ อาเซียน เรื่องเรือล่าช้า", en: "Tell Shanghai ASEAN about the sailing delay" },
  南沙三柜补料截止: { th: "ส่ง SI 3 ตู้หนานซาก่อน Cut-off", en: "SI cut-off for the 3 Nansha boxes" },
  "树胶柜 VGM 提交": { th: "ส่ง VGM ตู้ยางพารา", en: "Submit VGM for the rubber boxes" },
  蛇口罐头柜装箱照片: { th: "รูปถ่ายการบรรจุตู้ผลไม้กระป๋องไปเสอโข่ว", en: "Stuffing photos for the Shekou canned-fruit boxes" },
  上海汽配订舱确认: { th: "ยืนยัน Booking อะไหล่รถยนต์เซี่ยงไฮ้", en: "Confirm the Shanghai auto-parts booking" },
  青岛化工柜放行单: { th: "ใบปล่อยตู้เคมีภัณฑ์ชิงเต่า", en: "Release order for the Qingdao chemical boxes" },
  青岛化工柜派车: { th: "จัดรถรับตู้เคมีภัณฑ์ชิงเต่า", en: "Dispatch trucks for the Qingdao chemical boxes" },
  空箱回运费用核对: { th: "ตรวจค่าใช้จ่ายส่งตู้เปล่ากลับ", en: "Check empty repositioning costs" },
  北榄胶提单确认: { th: "ยืนยัน B/L ยางสมุทรปราการ", en: "Confirm B/L for Samut Prakan rubber" },

  // activities
  "罗勇来信：TCLU3308812 产地证未到，问盐田周五班。": {
    th: "ระยองอีเมลมา: C/O ของ TCLU3308812 ยังไม่มา ถามรอบเรือหยานเถียนวันศุกร์",
    en: "Rayong wrote: C/O for TCLU3308812 not in yet, asking about Friday's Yantian sailing.",
  },
  "吴南确认两柜产地证下午补扫。": {
    th: "คุณอู๋ หนาน ยืนยันจะสแกน C/O ของ 2 ตู้ส่งเพิ่มบ่ายนี้",
    en: "Wu Nan confirmed the C/O scans for both boxes this afternoon.",
  },
  "北榄胶要加两只 40HC，周三截关。": {
    th: "ยางสมุทรปราการจะเพิ่ม 40HC 2 ตู้ Cut-off วันพุธ",
    en: "Samut Prakan Rubber adding two 40HC, cut-off Wednesday.",
  },
  "春武里协会见面，谈林查班直航盐田。": {
    th: "พบสมาคมที่ชลบุรี คุยเส้นทางตรงแหลมฉบัง–หยานเถียน",
    en: "Met the Chonburi association about a direct Laem Chabang–Yantian service.",
  },
  "重发八月对账单，账龄 41 天。": {
    th: "ส่งใบกระทบยอดเดือน ส.ค. ซ้ำ ค้างชำระ 41 วัน",
    en: "Resent the August statement, 41 days outstanding.",
  },
  "盐田家具加柜超重，改 9 日班。": {
    th: "ตู้เฟอร์นิเจอร์ที่เพิ่มจากหยานเถียนน้ำหนักเกิน เลื่อนไปรอบวันที่ 9",
    en: "Extra Yantian furniture box is overweight, moved to the 9th sailing.",
  },
  "华运确认六月尾款本周五安排付款。": {
    th: "หัวหยุนยืนยันจะโอนยอดค้างเดือน มิ.ย. วันศุกร์นี้",
    en: "Huayun confirmed the June balance will be paid this Friday.",
  },
  "南沙两柜到港，海关抽中查验，已约明早。": {
    th: "2 ตู้จากหนานซาถึงท่าแล้ว ศุลกากรสุ่มตรวจ นัดไว้พรุ่งนี้เช้า",
    en: "Both Nansha boxes have arrived and were picked for customs inspection, booked for tomorrow morning.",
  },
  "东莞电子十月旺季要加 6 柜，报价需复核。": {
    th: "อิเล็กทรอนิกส์ตงกวนจะเพิ่ม 6 ตู้ช่วงพีคเดือน ต.ค. ต้องทบทวนราคา",
    en: "Dongguan electronics wants 6 extra boxes for the October peak; quote needs review.",
  },
  "罗勇冷冻食品年度合约面谈，意向 16 柜。": {
    th: "คุยสัญญารายปีอาหารแช่แข็งระยอง สนใจ 16 ตู้",
    en: "Met Rayong frozen food about the annual contract, interested in 16 boxes.",
  },
  "上海东盟八月账款部分到账，余款催收中。": {
    th: "เซี่ยงไฮ้ อาเซียน โอนยอด ส.ค. มาบางส่วน กำลังติดตามส่วนที่เหลือ",
    en: "Shanghai ASEAN paid part of August; chasing the balance.",
  },
  "蛇口家具柜清关放行，安排明天派送。": {
    th: "ตู้เฟอร์นิเจอร์เสอโข่วผ่านพิธีการศุลกากรแล้ว จัดส่งพรุ่งนี้",
    en: "Shekou furniture box cleared customs, delivery booked for tomorrow.",
  },
  "义乌确认厦门瓷砖柜已开船，预计五天到曼谷。": {
    th: "อี้อูยืนยันตู้กระเบื้องจากเซี่ยเหมินออกเรือแล้ว คาดถึงกรุงเทพฯ ใน 5 วัน",
    en: "Yiwu confirmed the Xiamen tile box has sailed, due in Bangkok in five days.",
  },
  "空箱回运年度协议已签，按月结算。": {
    th: "เซ็นสัญญารายปีส่งตู้เปล่ากลับแล้ว เรียกเก็บรายเดือน",
    en: "Annual empty repositioning agreement signed, billed monthly.",
  },

  // documents
  "装箱单 树胶": { th: "Packing list ยางพารา", en: "Packing list – natural rubber" },
  "发票 八月": { th: "Invoice เดือน ส.ค.", en: "Invoice – August" },
  "订舱 盐田 9/6": { th: "Booking หยานเถียน 9/6", en: "Booking Yantian 9/6" },

  // commodities
  家具: { th: "เฟอร์นิเจอร์", en: "Furniture" },
  机械配件: { th: "อะไหล่เครื่องจักร", en: "Machinery parts" },
  塑料粒: { th: "เม็ดพลาสติก", en: "Plastic pellets" },
  小商品: { th: "สินค้าเบ็ดเตล็ด", en: "General merchandise" },
  化工: { th: "เคมีภัณฑ์", en: "Chemicals" },
  电子: { th: "อิเล็กทรอนิกส์", en: "Electronics" },
  棉纱: { th: "เส้นด้ายฝ้าย", en: "Cotton yarn" },
  冷冻食品: { th: "อาหารแช่แข็ง", en: "Frozen food" },
  树胶: { th: "ยางพารา", en: "Natural rubber" },

  // demo-mode customers / shippers (src/shell/seedLcs.ts)
  粤泰贸易: { th: "เยว่ไท่ เทรดดิ้ง", en: "Yuetai Trading" },
  东海供应链: { th: "ตงไห่ ซัพพลายเชน", en: "Donghai Supply Chain" },
  深圳华运: { th: "หัวหยุน เซินเจิ้น", en: "HuaYun Shenzhen" },
  曼谷精工: { th: "บางกอก พรีซิชั่น", en: "Bangkok Precision" },
  罗勇塑胶: { th: "ระยอง พลาสติก", en: "Rayong Plastics" },
  上海联通物流: { th: "เซี่ยงไฮ้ เหลียนทง โลจิสติกส์", en: "Shanghai LianTong Logistics" },
  盐田港务代理: { th: "ตัวแทนท่าเรือหยานเถียน", en: "Yantian Port Agency" },
  林查班仓储: { th: "คลังสินค้าแหลมฉบัง", en: "Laem Chabang Warehousing" },
  黄埔机电: { th: "หวงผู่ เครื่องกลไฟฟ้า", en: "Huangpu Mechanical & Electrical" },
  春武里汽车件: { th: "ชลบุรี ออโต้พาร์ท", en: "Chonburi Auto Parts" },
  厦门海翔: { th: "เซี่ยเหมิน ไห่เสียง", en: "Xiamen Haixiang" },
  青岛远航: { th: "ชิงเต่า หย่วนหาง", en: "Qingdao Yuanhang" },
  泰国建材进口: { th: "ไทย วัสดุก่อสร้างนำเข้า", en: "Thai Building Materials Import" },
  佛山陶瓷出口: { th: "ฝอซาน เซรามิก ส่งออก", en: "Foshan Ceramics Export" },
  合艾冷链: { th: "หาดใหญ่ ห้องเย็น", en: "Hat Yai Cold Chain" },

  // demo customers (src/data.ts) — also have nameTh/nameEn, listed so free-text references translate
  深圳华运国际货运: { th: "หัวหยุน เซินเจิ้น", en: "Shenzhen Huayun Freight" },
  宁波港泰供应链: { th: "กั่งไท หนิงโป", en: "Ningbo Gangtai Supply" },
  青岛中泰物流: { th: "จงไท่ ชิงเต่า โลจิสติกส์", en: "Qingdao Zhongtai Logistics" },
  广州南沙联运: { th: "หนานซา เหลียนยวิ่น กว่างโจว", en: "Guangzhou Nansha Multimodal" },
  义乌出海仓: { th: "คลังส่งออกอี้อู", en: "Yiwu Export Warehouse" },
  东莞联胜货代: { th: "เหลียนเซิ่ง ตงกวน", en: "Dongguan Liansheng Forwarding" },
  上海东盟航运: { th: "เซี่ยงไฮ้ อาเซียน ชิปปิ้ง", en: "Shanghai ASEAN Shipping" },
  林查班泰华仓储: { th: "ไทฮว๋า คลังสินค้าแหลมฉบัง", en: "Laem Chabang Taihua Warehousing" },
  罗勇泰出食品: { th: "ระยอง ฟู้ดส์ ส่งออก", en: "Rayong Food Export" },
  北榄树胶出口: { th: "สมุทรปราการ ยางพาราส่งออก", en: "Samut Prakan Rubber Export" },
};

const DICT: Record<string, Tr> = { ...PLACES, ...PEOPLE, ...TEXT };

const CJK = /[一-鿿]/;
const LANE_SEP = /(\s*(?:→|->|—>|⇒)\s*)/;

function pick(tr: Tr, locale: Locale): string {
  return locale === "th" ? tr.th : tr.en;
}

/** One place / yard label: "林查班 B1" → "แหลมฉบัง B1". */
function place(part: string, locale: Locale): string | null {
  const s = part.trim();
  const hit = PLACES[s];
  if (hit) return pick(hit, locale);
  const m = s.match(/^(\S+)\s+([A-Z]{1,2}\d{1,3})$/);
  if (m && PLACES[m[1]!]) return `${pick(PLACES[m[1]!]!, locale)} ${m[2]}`;
  return null;
}

/**
 * Sample text in the UI language. zh (or non-Chinese input) → unchanged.
 * Exact dictionary hit → translation; lane "A → B" / yard "林查班 B1" → translated part by part;
 * anything else (user-typed text) → unchanged.
 */
export function localizeDemo(text: string | null | undefined, locale: Locale | string): string {
  const s = text ?? "";
  if (!s || locale === "zh" || !CJK.test(s)) return s;
  const loc = (locale === "th" ? "th" : "en") as Locale;
  const key = s.trim();
  const hit = DICT[key];
  if (hit) return pick(hit, loc);
  const pl = place(key, loc);
  if (pl) return pl;
  if (LANE_SEP.test(key)) {
    const parts = key.split(LANE_SEP);
    // odd indexes are separators; translate every place, keep unknown parts as typed
    const out = parts.map((p, i) => (i % 2 ? p : place(p, loc) ?? (DICT[p.trim()] ? pick(DICT[p.trim()]!, loc) : p)));
    return out.join("");
  }
  return s;
}

/** All spellings of a value (stored + th + en), for search that should match whatever the user sees. */
export function demoSearchText(text: string | null | undefined): string {
  const s = text ?? "";
  if (!s || !CJK.test(s)) return s;
  return `${s} ${localizeDemo(s, "th")} ${localizeDemo(s, "en")}`;
}

/** Signed-in user's name in the UI language: zh → nameZh; th → Thai transliteration when known, else the roman name. */
export function localizedUserName(u: { name?: string | null; nameZh?: string | null } | null | undefined, locale: Locale | string): string {
  if (!u) return "";
  const zh = u.nameZh ?? "";
  const roman = u.name ?? "";
  if (locale === "zh") return zh || roman;
  if (locale === "th" && zh) {
    const th = localizeDemo(zh, "th");
    if (!CJK.test(th)) return th;
  }
  return roman || localizeDemo(zh, locale);
}
