import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "./index.js";
import { users } from "./schema/auth.js";
import { caseEvents, caseSlaPolicies, cases } from "./schema/cases.js";
import { customers } from "./schema/crm.js";
import { businessUnits, lineChannels, lineContacts } from "./schema/inbox.js";
import { DEMO_ORG_ID } from "../domain/tenancy.js";
import { processLineEvent } from "../services/line-inbox.service.js";

/**
 * Demo business units, a 30-minute first-response SLA, and a LINE inbox with three OAs (not
 * connected to real LINE — the settings "test message" button feeds them) plus chats that opened
 * cases. Generic names: the public demo must not look like any real company's system.
 * Idempotent: stable ids, LINE message ids de-duplicate, user edits are kept.
 */

const M = 60_000;

const UNITS = [
  { id: "bu-seed-port", name: "ท่าเรือ", color: "teal" },
  { id: "bu-seed-depot", name: "ลานตู้เปล่า", color: "blue" },
  { id: "bu-seed-barge", name: "เรือลำเลียง", color: "violet" },
  { id: "bu-seed-cfs", name: "บรรจุตู้ CFS", color: "amber" },
  { id: "bu-seed-truck", name: "รถขนส่ง", color: "rose" },
] as const;

/** Port customer service answers within 30 minutes, around the clock. */
const SLA = [
  { priority: "urgent", firstResponseMinutes: 15, resolveMinutes: 2 * 60 },
  { priority: "high", firstResponseMinutes: 30, resolveMinutes: 4 * 60 },
  { priority: "normal", firstResponseMinutes: 30, resolveMinutes: 8 * 60 },
  { priority: "low", firstResponseMinutes: 60, resolveMinutes: 24 * 60 },
];

const ACK = "ได้รับข้อความแล้วครับ เลขเรื่อง {case} เจ้าหน้าที่จะตอบภายใน 30 นาที";

const CHANNELS = [
  { id: "lc-seed-port", name: "LINE ท่าเรือ", unit: "bu-seed-port", key: "demo-port-7f3k2q" },
  { id: "lc-seed-depot", name: "LINE ลานตู้เปล่า", unit: "bu-seed-depot", key: "demo-depot-9x1m4w" },
  { id: "lc-seed-truck", name: "LINE รถขนส่ง", unit: "bu-seed-truck", key: "demo-truck-2c8v6p" },
] as const;

type Chat = {
  n: number;
  channel: (typeof CHANNELS)[number]["id"];
  who: string;
  customerId?: string;
  agoMin: number;
  messages: { atMin: number; text?: string; kind?: "image" | "sticker" }[];
  reply?: { atMin: number; body: string; status?: "in_progress" | "waiting_customer" | "resolved" };
  priority?: "high" | "urgent";
  assignCs?: boolean;
};

const CHATS: Chat[] = [
  {
    n: 1,
    channel: "lc-seed-port",
    who: "เอก ชิปปิ้ง",
    agoMin: 12,
    messages: [{ atMin: 0, text: "สวัสดีครับ ตู้ TGHU8812345 ลงจากเรือหรือยังครับ จะส่งรถเข้าไปรับบ่ายนี้" }],
  },
  {
    n: 2,
    channel: "lc-seed-depot",
    who: "Nok Logistics",
    agoMin: 48,
    messages: [{ atMin: 0, text: "ขอเช็คตู้เปล่า 40HC มีพร้อมจ่ายไหมคะ ต้องการ 3 ตู้ พรุ่งนี้เช้า" }],
  },
  {
    n: 3,
    channel: "lc-seed-truck",
    who: "วิชัย (ยางสมุทรปราการ)",
    customerId: "c10",
    agoMin: 95,
    priority: "high",
    assignCs: true,
    messages: [
      { atMin: 0, text: "รถเข้าคิวรอหน้าท่า 2 ชั่วโมงแล้วครับ ยังไม่ได้เข้าเลย ช่วยเช็คให้หน่อย" },
      { atMin: 1, kind: "image" },
    ],
    reply: { atMin: 9, body: "ขออภัยครับคุณวิชัย ตอนนี้ประสานหน้าท่าให้แล้ว รถทะเบียนในรูปจะได้เข้าคิวถัดไปภายใน 20 นาทีครับ", status: "in_progress" },
  },
  {
    n: 4,
    channel: "lc-seed-port",
    who: "ปรีดา สายทอง",
    customerId: "mk-c06",
    agoMin: 180,
    assignCs: true,
    messages: [{ atMin: 0, text: "ใบเสร็จค่าภาระตู้ SEGU4471230 ไม่ขึ้นในระบบ e-receipt ครับ ต้องใช้เบิกบริษัท" }],
    reply: { atMin: 14, body: "รับทราบครับ ตรวจแล้วใบเสร็จออกแล้ว รบกวนแจ้งเลขผู้เสียภาษีของบริษัทเพื่อออกใหม่ในชื่อบริษัทครับ", status: "waiting_customer" },
  },
  {
    n: 5,
    channel: "lc-seed-port",
    who: "Mint Import",
    agoMin: 26 * 60,
    assignCs: true,
    messages: [{ atMin: 0, text: "ค่าฝากตู้เกินกำหนดคิดวันละเท่าไหร่คะ ตู้ 20 ฟุต" }],
    reply: { atMin: 11, body: "ค่าฝากตู้ 20 ฟุตหลังพ้นวันฟรี คิดตามอัตราประกาศของท่าครับ ส่งตารางอัตราให้ทางอีเมลแล้วครับ", status: "resolved" },
  },
];

export async function seedLineInbox(db: Db, now = new Date()) {
  for (const [i, u] of UNITS.entries()) {
    await db
      .insert(businessUnits)
      .values({ id: u.id, organizationId: DEMO_ORG_ID, name: u.name, color: u.color, sortOrder: (i + 1) * 10 })
      .onConflictDoNothing({ target: businessUnits.id });
  }

  // Only when the demo company never set its own targets.
  const hasPolicy = await db.select({ p: caseSlaPolicies.priority }).from(caseSlaPolicies).where(eq(caseSlaPolicies.organizationId, DEMO_ORG_ID)).limit(1);
  if (!hasPolicy.length) {
    await db.insert(caseSlaPolicies).values(SLA.map((s) => ({ organizationId: DEMO_ORG_ID, ...s }))).onConflictDoNothing();
  }

  for (const c of CHANNELS) {
    await db
      .insert(lineChannels)
      .values({ id: c.id, organizationId: DEMO_ORG_ID, name: c.name, webhookKey: c.key, businessUnitId: c.unit, ackMessage: ACK })
      .onConflictDoNothing({ target: lineChannels.id });
  }
  const channelRows = await db.select().from(lineChannels).where(inArray(lineChannels.id, CHANNELS.map((c) => c.id)));
  const [cs] = await db.select({ id: users.id }).from(users).where(eq(users.email, "cs@cangzhan.com")).limit(1);
  const custIds = new Set((await db.select({ id: customers.id }).from(customers).where(eq(customers.organizationId, DEMO_ORG_ID))).map((r) => r.id));

  let chats = 0;
  for (const chat of CHATS) {
    const channel = channelRows.find((r) => r.id === chat.channel);
    if (!channel) continue;
    const opened = new Date(now.getTime() - chat.agoMin * M);
    const lineUserId = `Useed${String(chat.n).padStart(28, "0")}`;
    // A linked chat arrives with its customer already set — the way it works after staff link it once.
    if (chat.customerId && custIds.has(chat.customerId)) {
      await db
        .insert(lineContacts)
        .values({ id: `lu-seed-${chat.n}`, organizationId: DEMO_ORG_ID, channelId: channel.id, lineUserId, displayName: chat.who, customerId: chat.customerId })
        .onConflictDoNothing();
    }
    let first: Awaited<ReturnType<typeof processLineEvent>> = null;
    for (const [i, m] of chat.messages.entries()) {
      const res = await processLineEvent(
        db,
        channel,
        null,
        {
          type: "message",
          source: { type: "user", userId: lineUserId },
          message: m.kind ? { id: `seed-line-${chat.n}-${i}`, type: m.kind } : { id: `seed-line-${chat.n}-${i}`, type: "text", text: m.text },
        },
        new Date(opened.getTime() + m.atMin * M),
        { displayName: chat.who },
      );
      first ??= res;
    }
    if (!first?.created) continue; // already seeded (or touched) — leave it alone
    chats++;

    const set: Partial<typeof cases.$inferInsert> = {};
    if (chat.priority) {
      set.priority = chat.priority;
      const t = SLA.find((s) => s.priority === chat.priority)!;
      set.firstResponseDueAt = new Date(opened.getTime() + t.firstResponseMinutes * M);
      set.resolveDueAt = new Date(opened.getTime() + t.resolveMinutes * M);
    }
    if (chat.assignCs && cs) Object.assign(set, { assigneeUserId: cs.id, assignedAt: opened, assignedBy: cs.id });
    if (chat.reply) {
      const at = new Date(opened.getTime() + chat.reply.atMin * M);
      await db
        .insert(caseEvents)
        .values({
          id: `ce-seed-line-${chat.n}-r`,
          organizationId: DEMO_ORG_ID,
          caseId: first.caseId,
          type: "reply",
          body: chat.reply.body,
          data: { via: "line", channel: channel.name, delivery: "sent", error: null },
          userId: cs?.id ?? null,
          createdAt: at,
        })
        .onConflictDoNothing();
      set.firstRespondedAt = at;
      if (chat.reply.status) {
        set.status = chat.reply.status;
        await db
          .insert(caseEvents)
          .values({
            id: `ce-seed-line-${chat.n}-s`,
            organizationId: DEMO_ORG_ID,
            caseId: first.caseId,
            type: "status",
            data: { from: "new", to: chat.reply.status },
            userId: cs?.id ?? null,
            createdAt: new Date(at.getTime() + 1000),
          })
          .onConflictDoNothing();
        if (chat.reply.status === "resolved") set.resolvedAt = new Date(at.getTime() + 1000);
      }
      set.updatedAt = new Date(at.getTime() + 1000);
    }
    if (Object.keys(set).length) await db.update(cases).set(set).where(eq(cases.id, first.caseId));
  }

  // Tag the older demo cases and some customers with units so filters and reports have data.
  const unitIds = UNITS.map((u) => u.id);
  const untagged = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.organizationId, DEMO_ORG_ID), isNull(cases.businessUnitId), sql`${cases.id} like 'cs-seed-%'`));
  for (const [i, r] of untagged.entries()) {
    await db.update(cases).set({ businessUnitId: unitIds[i % unitIds.length] }).where(eq(cases.id, r.id));
  }
  const tagCustomers: Record<string, string[]> = {
    c10: ["bu-seed-port", "bu-seed-truck"],
    "mk-c06": ["bu-seed-port", "bu-seed-depot", "bu-seed-truck"],
    "mk-c01": ["bu-seed-port", "bu-seed-cfs"],
    "mk-c02": ["bu-seed-port"],
    "mk-c04": ["bu-seed-barge", "bu-seed-port"],
    c9: ["bu-seed-port", "bu-seed-depot"],
  };
  for (const [id, units] of Object.entries(tagCustomers)) {
    if (!custIds.has(id)) continue;
    await db
      .update(customers)
      .set({ businessUnits: units })
      .where(and(eq(customers.id, id), sql`${customers.businessUnits} = '[]'::jsonb`));
  }

  return { units: UNITS.length, channels: CHANNELS.length, chats };
}
