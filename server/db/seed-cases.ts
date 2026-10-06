import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./index.js";
import { users } from "./schema/auth.js";
import { cannedReplies, caseEvents, cases } from "./schema/cases.js";
import { contacts, customers } from "./schema/crm.js";
import { bookings, jobs } from "./schema/operations.js";
import { DEMO_ORG_ID } from "../domain/tenancy.js";
import { computeDue, type CaseCategory, type CaseChannel, type CasePriority, type CaseStatus } from "../domain/cases.js";

/**
 * Demo customer service cases + canned replies (Thai — the customer's working language).
 * Stable ids; times are relative to "now" so some cases are always SLA-breached and some due soon.
 * Re-running refreshes only cases nobody has touched in the app (updated_at still = created_at).
 */

const H = 3_600_000;

type Ev =
  | { type: "reply"; atH: number; via: "email" | "phone" | "line"; body: string; by?: Who }
  | { type: "comment"; atH: number; body: string; by?: Who }
  | { type: "status"; atH: number; from: CaseStatus; to: CaseStatus; by?: Who };

type Who = "cs" | "admin";

type Spec = {
  n: number;
  subject: string;
  description?: string;
  customerId: string;
  contactId?: string;
  channel: CaseChannel;
  category: CaseCategory;
  priority: CasePriority;
  status: CaseStatus;
  assignee: Who | null;
  /** Hours before now the case was opened. */
  agoH: number;
  jobId?: string;
  box?: string;
  bookingId?: string;
  /** Hours after opening (positive) */
  events?: Ev[];
  resolvedAfterH?: number;
};

const SPECS: Spec[] = [
  {
    n: 1,
    subject: "สอบถามตู้ TCLU3308812 จะถึงท่าเมื่อไร",
    description: "ลูกค้าทักทาง LINE ถามว่าตู้อาหารแช่แข็งจะถึงเซินเจิ้นวันไหน ต้องนัดรถรับต่อ",
    customerId: "c9",
    contactId: "p4",
    channel: "line",
    category: "status_inquiry",
    priority: "high",
    status: "new",
    assignee: null,
    agoH: 5,
    jobId: "s2",
    box: "TCLU3308812",
  },
  {
    n: 2,
    subject: "ขอสำเนา B/L งานเฟอร์นิเจอร์ เรือ MSC LONDON",
    customerId: "c1",
    contactId: "p1",
    channel: "email",
    category: "documents",
    priority: "normal",
    status: "in_progress",
    assignee: "cs",
    agoH: 20,
    jobId: "s3",
    events: [
      { type: "reply", atH: 2, via: "email", body: "เรียนคุณจ้าว\n\nรับเรื่องแล้ว กำลังขอสำเนา B/L จากสายเรือ จะส่งให้ภายในวันนี้\n\nขอแสดงความนับถือ" },
      { type: "comment", atH: 3, body: "ขอ MSC แล้ว รอไฟล์ PDF" },
    ],
  },
  {
    n: 3,
    subject: "ตู้ COSU7193348 ติดตรวจที่ท่า ขอทราบสาเหตุด่วน",
    description: "ลูกค้าโทรมาแจ้งว่ารถไปรับตู้แล้วรับไม่ได้ ระบบท่าขึ้นสถานะ hold",
    customerId: "c4",
    contactId: "p3",
    channel: "phone",
    category: "complaint",
    priority: "urgent",
    status: "in_progress",
    assignee: "cs",
    agoH: 3.35,
    jobId: "s1",
    box: "COSU7193348",
    events: [
      { type: "reply", atH: 0.6, via: "phone", body: "โทรแจ้งลูกค้าว่ากำลังตรวจสอบกับศุลกากร จะโทรกลับภายใน 1 ชม." },
      { type: "comment", atH: 1, body: "ศุลกากรสุ่มตรวจ X-ray นัดตรวจพรุ่งนี้เช้า ต้องแจ้งลูกค้าเรื่องค่าใช้จ่ายเพิ่ม" },
    ],
  },
  {
    n: 4,
    subject: "ขอราคาตู้ 40HC แหลมฉบัง–หนิงโป ล็อตเดือนหน้า",
    customerId: "c10",
    contactId: "p5",
    channel: "email",
    category: "pricing",
    priority: "normal",
    status: "waiting_customer",
    assignee: "admin",
    agoH: 30,
    jobId: "s9",
    events: [
      { type: "reply", atH: 3, via: "email", body: "เรียนคุณวิชัย\n\nขอทราบจำนวนตู้และวันที่ต้องการส่งออก เพื่อเสนอราคาที่เหมาะสม\n\nขอแสดงความนับถือ" },
      { type: "status", atH: 3, from: "in_progress", to: "waiting_customer" },
    ],
  },
  {
    n: 5,
    subject: "เรือ ONE COMMITMENT เลื่อน ETA หรือไม่",
    customerId: "c9",
    contactId: "p12",
    channel: "phone",
    category: "status_inquiry",
    priority: "normal",
    status: "resolved",
    assignee: "cs",
    agoH: 9,
    jobId: "s2",
    resolvedAfterH: 7.5,
    events: [
      { type: "reply", atH: 1, via: "phone", body: "แจ้งลูกค้าว่าเรือยังตามกำหนดเดิม ไม่มีการเลื่อน" },
      { type: "status", atH: 7.5, from: "in_progress", to: "resolved" },
    ],
  },
  {
    n: 6,
    subject: "ยังไม่ได้รับใบขนสินค้าขาเข้า",
    customerId: "c3",
    contactId: "p6",
    channel: "email",
    category: "documents",
    priority: "high",
    status: "new",
    assignee: "cs",
    agoH: 0.5,
    jobId: "s18",
  },
  {
    n: 7,
    subject: "ร้องเรียน: ค่าเสียเวลาตู้ (demurrage) สูงกว่าที่ตกลง",
    description: "ลูกค้าแย้งว่าวันฟรีควรเป็น 7 วัน ไม่ใช่ 5 วัน ขอให้ตรวจสอบสัญญา",
    customerId: "c4",
    contactId: "p3",
    channel: "email",
    category: "complaint",
    priority: "high",
    status: "waiting_customer",
    assignee: "admin",
    agoH: 72,
    jobId: "s16",
    box: "CSNU6620423",
    events: [
      { type: "reply", atH: 2, via: "email", body: "เรียนคุณอู๋\n\nได้รับเรื่องแล้ว กำลังตรวจสอบเงื่อนไขวันฟรีตามสัญญา ขอเอกสารสัญญาฉบับที่ลูกค้าถืออยู่เพื่อเทียบ\n\nขอแสดงความนับถือ" },
      { type: "status", atH: 2, from: "in_progress", to: "waiting_customer" },
      { type: "comment", atH: 26, body: "ยังไม่ได้รับสัญญาจากลูกค้า ควรโทรตาม", by: "cs" },
    ],
  },
  {
    n: 8,
    subject: "สอบถามวันฟรีสุดท้ายตู้ CSNU6620418",
    customerId: "c4",
    channel: "line",
    category: "status_inquiry",
    priority: "normal",
    status: "in_progress",
    assignee: "cs",
    agoH: 7,
    jobId: "s16",
    box: "CSNU6620418",
    events: [{ type: "status", atH: 0.5, from: "new", to: "in_progress" }],
  },
  {
    n: 9,
    subject: "แก้ชื่อผู้รับสินค้าใน B/L",
    customerId: "c2",
    contactId: "p8",
    channel: "email",
    category: "documents",
    priority: "normal",
    status: "resolved",
    assignee: "cs",
    agoH: 46,
    jobId: "s7",
    resolvedAfterH: 22,
    events: [
      { type: "reply", atH: 1.5, via: "email", body: "เรียนคุณเหอ\n\nส่งคำขอแก้ไขให้สายเรือแล้ว จะแจ้งเมื่อได้ B/L ฉบับใหม่\n\nขอแสดงความนับถือ" },
      { type: "status", atH: 22, from: "in_progress", to: "resolved" },
    ],
  },
  {
    n: 10,
    subject: "ขอทราบกำหนดเข้าท่า ตู้ OOLU8844011",
    customerId: "c10",
    channel: "walk_in",
    category: "status_inquiry",
    priority: "low",
    status: "closed",
    assignee: "cs",
    agoH: 96,
    jobId: "s9",
    box: "OOLU8844011",
    resolvedAfterH: 2,
    events: [
      { type: "reply", atH: 0.3, via: "phone", body: "แจ้งลูกค้าที่หน้าเคาน์เตอร์ว่าตู้เข้าลานแล้ว รอขึ้นเรือ EVER BLISS" },
      { type: "status", atH: 2, from: "in_progress", to: "closed" },
    ],
  },
  {
    n: 11,
    subject: "ขอเอกสาร D/O งานหนานซา",
    customerId: "c4",
    channel: "portal",
    category: "documents",
    priority: "normal",
    status: "new",
    assignee: null,
    agoH: 1,
    jobId: "s16",
  },
  {
    n: 12,
    subject: "สอบถามค่าภาระหน้าท่า (THC) ตู้ 20GP",
    customerId: "c8",
    contactId: "p11",
    channel: "phone",
    category: "pricing",
    priority: "low",
    status: "in_progress",
    assignee: "admin",
    agoH: 26,
    events: [{ type: "reply", atH: 4, via: "phone", body: "แจ้งอัตรา THC เบื้องต้นทางโทรศัพท์ จะส่งใบเสนอราคาทางอีเมล" }],
  },
  {
    n: 13,
    subject: "สินค้าเสียหาย ตู้ ONEU0417736",
    description: "ลูกค้าแจ้งว่าเฟอร์นิเจอร์ในตู้แตกเสียหาย 6 ชิ้น ขอให้ตรวจสอบและเปิดเคลม",
    customerId: "c1",
    contactId: "p2",
    channel: "email",
    category: "complaint",
    priority: "urgent",
    status: "new",
    assignee: "cs",
    agoH: 2,
    jobId: "s17",
    box: "ONEU0417736",
  },
  {
    n: 14,
    subject: "ยืนยัน Booking เรือ MSC ARINA",
    customerId: "c2",
    contactId: "p8",
    channel: "line",
    category: "status_inquiry",
    priority: "normal",
    status: "waiting_customer",
    assignee: "cs",
    agoH: 10,
    jobId: "s13",
    events: [
      { type: "reply", atH: 1, via: "line", body: "ยืนยัน Booking แล้ว รอลูกค้าส่ง SI ภายในวันพรุ่งนี้" },
      { type: "status", atH: 1, from: "in_progress", to: "waiting_customer" },
    ],
  },
  {
    n: 15,
    subject: "สอบถามสถานะงานเรือ SITC XIAMEN",
    customerId: "c5",
    contactId: "p7",
    channel: "phone",
    category: "status_inquiry",
    priority: "normal",
    status: "closed",
    assignee: "cs",
    agoH: 120,
    jobId: "s15",
    resolvedAfterH: 1,
    events: [
      { type: "reply", atH: 0.4, via: "phone", body: "แจ้งลูกค้าว่าเรือออกแล้ว คาดว่าถึงกรุงเทพฯ ตามกำหนด" },
      { type: "status", atH: 1, from: "in_progress", to: "closed" },
    ],
  },
  {
    n: 16,
    subject: "แจ้งเปลี่ยนที่อยู่จัดส่งสินค้า",
    customerId: "c6",
    contactId: "p9",
    channel: "email",
    category: "other",
    priority: "normal",
    status: "resolved",
    assignee: "cs",
    agoH: 6,
    jobId: "s14",
    resolvedAfterH: 5,
    events: [
      { type: "reply", atH: 0.8, via: "email", body: "เรียนคุณเหลียง\n\nแก้ไขที่อยู่จัดส่งในระบบเรียบร้อยแล้ว\n\nขอแสดงความนับถือ" },
      { type: "status", atH: 5, from: "in_progress", to: "resolved" },
    ],
  },
];

const CANNED: { id: string; title: string; category: CaseCategory | null; body: string }[] = [
  {
    id: "cr-seed-01",
    title: "รับเรื่องแล้ว",
    category: null,
    body: "เรียน {customer}\n\nได้รับเรื่องของท่านแล้ว กำลังตรวจสอบและจะแจ้งความคืบหน้าโดยเร็วที่สุด\n\nขอแสดงความนับถือ\n{agent}",
  },
  {
    id: "cr-seed-02",
    title: "ตู้ถึงท่าแล้ว",
    category: "status_inquiry",
    body: "เรียน {customer}\n\nตู้ {container} (งาน {job}) มากับเรือ {vessel} ถึงท่าแล้วเมื่อ {eta} สามารถนัดรถเข้ารับตู้ได้ หากต้องการให้ช่วยประสานงานแจ้งได้เลย\n\nขอแสดงความนับถือ\n{agent}",
  },
  {
    id: "cr-seed-03",
    title: "แจ้งเลื่อนเรือ",
    category: "status_inquiry",
    body: "เรียน {customer}\n\nขอแจ้งว่าเรือ {vessel} ของงาน {job} มีการเปลี่ยนกำหนดถึงท่าเป็น {eta} ขออภัยในความไม่สะดวก ทางเราจะติดตามและแจ้งหากมีการเปลี่ยนแปลงอีก\n\nขอแสดงความนับถือ\n{agent}",
  },
  {
    id: "cr-seed-04",
    title: "เอกสารครบแล้ว",
    category: "documents",
    body: "เรียน {customer}\n\nเอกสารของงาน {job} ครบถ้วนแล้ว ทางเราจะดำเนินการพิธีการต่อทันที และแจ้งเมื่อพร้อมรับสินค้า\n\nขอแสดงความนับถือ\n{agent}",
  },
  {
    id: "cr-seed-05",
    title: "ขอเอกสารเพิ่มเติม",
    category: "documents",
    body: "เรียน {customer}\n\nเพื่อดำเนินการงาน {job} ต่อ รบกวนส่งเอกสารเพิ่มเติมดังนี้\n- \n\nขอแสดงความนับถือ\n{agent}",
  },
  {
    id: "cr-seed-06",
    title: "ส่งใบเสนอราคา",
    category: "pricing",
    body: "เรียน {customer}\n\nแนบใบเสนอราคาตามที่ท่านสอบถาม ราคานี้มีผลถึงสิ้นเดือน หากมีข้อสงสัยติดต่อได้ตลอด\n\nขอแสดงความนับถือ\n{agent}",
  },
];

export async function seedCases(db: Db, now = new Date()) {
  const people = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.email, ["cs@cangzhan.com", "admin@cangzhan.com"]));
  const who: Record<Who, string | null> = {
    cs: people.find((p) => p.email === "cs@cangzhan.com")?.id ?? null,
    admin: people.find((p) => p.email === "admin@cangzhan.com")?.id ?? null,
  };
  const custIds = new Set(
    (await db.select({ id: customers.id }).from(customers).where(eq(customers.organizationId, DEMO_ORG_ID))).map((c) => c.id),
  );
  const contactIds = new Set((await db.select({ id: contacts.id }).from(contacts)).map((c) => c.id));
  const jobRows = await db.select({ id: jobs.id, bookingId: jobs.bookingId }).from(jobs).where(eq(jobs.organizationId, DEMO_ORG_ID));
  const jobIds = new Set(jobRows.map((j) => j.id));
  const bookingIds = new Set((await db.select({ id: bookings.id }).from(bookings)).map((b) => b.id));
  const year = now.getFullYear();

  let canned = 0;
  for (const [i, c] of CANNED.entries()) {
    await db
      .insert(cannedReplies)
      .values({ id: c.id, organizationId: DEMO_ORG_ID, title: c.title, body: c.body, category: c.category, sortOrder: (i + 1) * 10, createdBy: who.admin })
      .onConflictDoNothing({ target: cannedReplies.id });
    canned++;
  }

  // Numbers already taken by cases created in the app (seed run late) are skipped, never clobbered.
  const taken = new Set(
    (
      await db
        .select({ no: cases.caseNo })
        .from(cases)
        .where(and(eq(cases.organizationId, DEMO_ORG_ID), sql`${cases.id} not like 'cs-seed-%'`))
    ).map((r) => r.no),
  );

  let count = 0;
  for (const s of SPECS) {
    if (!custIds.has(s.customerId)) continue;
    const id = `cs-seed-${String(s.n).padStart(2, "0")}`;
    if (taken.has(`CS-${year}-${String(s.n).padStart(6, "0")}`)) continue;
    const opened = new Date(now.getTime() - s.agoH * H);
    const due = computeDue(opened, s.priority);
    const firstReply = s.events?.find((e) => e.type === "reply");
    const respondedAt = firstReply ? new Date(opened.getTime() + firstReply.atH * H) : null;
    const resolvedAt = s.resolvedAfterH !== undefined ? new Date(opened.getTime() + s.resolvedAfterH * H) : null;
    const closedAt = s.status === "closed" ? resolvedAt : null;
    const assignee = s.assignee ? who[s.assignee] : null;
    const jobId = s.jobId && jobIds.has(s.jobId) ? s.jobId : null;
    const bookingId = s.bookingId && bookingIds.has(s.bookingId) ? s.bookingId : null;
    const row = {
      id,
      organizationId: DEMO_ORG_ID,
      caseNo: `CS-${year}-${String(s.n).padStart(6, "0")}`,
      customerId: s.customerId,
      contactId: s.contactId && contactIds.has(s.contactId) ? s.contactId : null,
      channel: s.channel,
      category: s.category,
      priority: s.priority,
      status: s.status,
      subject: s.subject,
      description: s.description ?? null,
      assigneeUserId: assignee,
      assignedAt: assignee ? opened : null,
      assignedBy: assignee ? who.admin : null,
      jobId,
      containerNo: s.box ?? null,
      bookingId,
      firstResponseDueAt: due.firstResponseDueAt,
      resolveDueAt: due.resolveDueAt,
      firstRespondedAt: respondedAt,
      resolvedAt,
      closedAt,
      createdBy: who.cs ?? who.admin,
      createdAt: opened,
      updatedAt: opened,
    };
    const res = await db
      .insert(cases)
      .values(row)
      .onConflictDoUpdate({
        target: cases.id,
        set: {
          firstResponseDueAt: row.firstResponseDueAt,
          resolveDueAt: row.resolveDueAt,
          firstRespondedAt: row.firstRespondedAt,
          resolvedAt: row.resolvedAt,
          closedAt: row.closedAt,
          assignedAt: row.assignedAt,
          createdAt: opened,
          updatedAt: opened,
        },
        setWhere: sql`${cases.updatedAt} = ${cases.createdAt}`,
      })
      .returning({ id: cases.id });
    count++;
    if (!res.length) continue; // touched in the app — leave its timeline alone

    await db.delete(caseEvents).where(and(eq(caseEvents.caseId, id), sql`${caseEvents.id} like 'ce-seed-%'`));
    const evs: (typeof caseEvents.$inferInsert)[] = [
      {
        id: `ce-seed-${s.n}-0`,
        organizationId: DEMO_ORG_ID,
        caseId: id,
        type: "created",
        data: { channel: s.channel, assignee },
        userId: who.cs ?? who.admin,
        createdAt: opened,
      },
    ];
    (s.events ?? []).forEach((e, i) => {
      const at = new Date(opened.getTime() + e.atH * H);
      const userId = who[e.by ?? s.assignee ?? "cs"];
      const base = { id: `ce-seed-${s.n}-${i + 1}`, organizationId: DEMO_ORG_ID, caseId: id, userId, createdAt: at };
      if (e.type === "reply") evs.push({ ...base, type: "reply", body: e.body, data: { via: e.via, ...(e.via === "email" ? { delivery: "sent" } : {}) } });
      else if (e.type === "comment") evs.push({ ...base, type: "comment", body: e.body, data: {} });
      else evs.push({ ...base, type: "status", data: { from: e.from, to: e.to } });
    });
    await db.insert(caseEvents).values(evs).onConflictDoNothing({ target: caseEvents.id });
  }

  // Keep the CS-<year> sequence ahead of the seeded numbers.
  await db.execute(sql`
    INSERT INTO doc_sequences (kind, year, last_seq) VALUES ('CS', ${year}, ${SPECS.length})
    ON CONFLICT (kind, year) DO UPDATE SET last_seq = GREATEST(doc_sequences.last_seq, EXCLUDED.last_seq)
  `);
  return { cases: count, canned };
}
