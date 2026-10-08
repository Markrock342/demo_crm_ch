import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { caseEvents, cases } from "../db/schema/cases.js";
import { businessUnits, lineChannels, lineContacts, type DbLineChannel } from "../db/schema/inbox.js";
import { CASE_OPEN_STATUSES, findContainerNo, guessCategory } from "../domain/cases.js";
import { openSecret, sealSecret } from "../lib/secret-box.js";
import { saveObject } from "../lib/storage.js";
import { writeAudit } from "./audit.service.js";
import { createCase, type CaseDto } from "./case.service.js";
import { getLineBotInfo, getLineContent, getLineProfile, replyLineWith, verifyLineSignature } from "./line.service.js";

/**
 * LINE inbox: the company's LINE Official Accounts (one per business unit, e.g. port, empty depot,
 * trucking) feed customer chats into cases. A message opens a case, or joins the chat's open case;
 * staff replies on that case are pushed back into the same chat (see replyToCase).
 */

/** Sample customer photos shipped in public/demo/ (chat-<key>.webp). */
export const DEMO_CHAT_IMAGES = ["truck-queue", "container-damage", "receipt", "container-seal"] as const;
export type DemoChatImage = (typeof DEMO_CHAT_IMAGES)[number];

export class LineInputError extends Error {
  code: string;
  field?: string;
  constructor(code: string, field?: string) {
    super(code);
    this.code = code;
    this.field = field;
  }
}

const clean = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

// ---------------------------------------------------------------------------
// Channels (settings)

export type LineChannelDto = {
  id: string;
  name: string;
  basicId: string | null;
  businessUnitId: string | null;
  ackMessage: string | null;
  active: boolean;
  /** Secret + token saved: real LINE traffic flows. Otherwise only the test sender works. */
  connected: boolean;
  hasSecret: boolean;
  tokenHint: string | null;
  webhookPath: string;
  lastEventAt: string | null;
  friends: number;
  openCases: number;
};

function toChannelDto(c: DbLineChannel, friends = 0, openCases = 0): LineChannelDto {
  return {
    id: c.id,
    name: c.name,
    basicId: c.basicId,
    businessUnitId: c.businessUnitId,
    ackMessage: c.ackMessage,
    active: c.active,
    connected: Boolean(c.channelSecretEnc && c.accessTokenEnc),
    hasSecret: Boolean(c.channelSecretEnc),
    tokenHint: c.tokenHint,
    webhookPath: `/api/webhooks/line/${c.webhookKey}`,
    lastEventAt: c.lastEventAt?.toISOString() ?? null,
    friends,
    openCases,
  };
}

export async function listLineChannels(db: Db, organizationId: string): Promise<LineChannelDto[]> {
  const rows = await db.select().from(lineChannels).where(eq(lineChannels.organizationId, organizationId)).orderBy(asc(lineChannels.createdAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [friends, open] = await Promise.all([
    db
      .select({ id: lineContacts.channelId, n: sql<number>`count(*)::int` })
      .from(lineContacts)
      .where(and(inArray(lineContacts.channelId, ids), eq(lineContacts.followed, true)))
      .groupBy(lineContacts.channelId),
    db
      .select({ id: lineContacts.channelId, n: sql<number>`count(*)::int` })
      .from(cases)
      .innerJoin(lineContacts, eq(cases.lineContactId, lineContacts.id))
      .where(and(inArray(lineContacts.channelId, ids), inArray(cases.status, [...CASE_OPEN_STATUSES])))
      .groupBy(lineContacts.channelId),
  ]);
  return rows.map((r) => toChannelDto(r, friends.find((f) => f.id === r.id)?.n ?? 0, open.find((o) => o.id === r.id)?.n ?? 0));
}

export type LineChannelInput = {
  name?: string;
  basicId?: string | null;
  channelSecret?: string | null;
  accessToken?: string | null;
  businessUnitId?: string | null;
  ackMessage?: string | null;
  active?: boolean;
};

async function assertUnit(db: Db, organizationId: string, id: string) {
  const [u] = await db
    .select({ id: businessUnits.id })
    .from(businessUnits)
    .where(and(eq(businessUnits.id, id), eq(businessUnits.organizationId, organizationId)))
    .limit(1);
  if (!u) throw new LineInputError("unknown_business_unit", "businessUnitId");
}

/** Checks a new token with LINE and returns the columns it fills. */
async function tokenColumns(token: string) {
  const info = await getLineBotInfo(token);
  if (!info) throw new LineInputError("line_token_rejected", "accessToken");
  return { accessTokenEnc: sealSecret(token), tokenHint: token.slice(-4), botUserId: info.userId, basicId: info.basicId, displayName: info.displayName };
}

const normBasicId = (v: string | null | undefined) => {
  const s = clean(v);
  if (!s) return null;
  return s.startsWith("@") ? s : `@${s}`;
};

export async function createLineChannel(db: Db, organizationId: string, userId: string, input: LineChannelInput) {
  const businessUnitId = clean(input.businessUnitId);
  if (businessUnitId) await assertUnit(db, organizationId, businessUnitId);
  const token = clean(input.accessToken);
  const tok = token ? await tokenColumns(token) : null;
  const secret = clean(input.channelSecret);
  const name = clean(input.name) ?? tok?.displayName ?? tok?.basicId ?? normBasicId(input.basicId);
  if (!name) throw new LineInputError("name_required", "name");
  const [row] = await db
    .insert(lineChannels)
    .values({
      id: `lc_${randomUUID()}`,
      organizationId,
      name,
      basicId: tok?.basicId ?? normBasicId(input.basicId),
      botUserId: tok?.botUserId ?? null,
      channelSecretEnc: secret ? sealSecret(secret) : null,
      accessTokenEnc: tok?.accessTokenEnc ?? null,
      tokenHint: tok?.tokenHint ?? null,
      webhookKey: randomBytes(18).toString("base64url"),
      businessUnitId,
      ackMessage: clean(input.ackMessage),
      active: input.active ?? true,
      createdBy: userId,
    })
    .returning();
  const dto = toChannelDto(row!);
  await writeAudit(db, { userId, organizationId, action: "LINE_CHANNEL_CREATED", entityType: "line_channel", entityId: row!.id, newValue: dto });
  return dto;
}

export async function updateLineChannel(db: Db, organizationId: string, userId: string, id: string, patch: LineChannelInput) {
  const [before] = await db
    .select()
    .from(lineChannels)
    .where(and(eq(lineChannels.id, id), eq(lineChannels.organizationId, organizationId)))
    .limit(1);
  if (!before) return null;
  const set: Partial<typeof lineChannels.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    const n = clean(patch.name);
    if (!n) throw new LineInputError("name_required", "name");
    set.name = n;
  }
  if (patch.basicId !== undefined) set.basicId = normBasicId(patch.basicId);
  if (patch.businessUnitId !== undefined) {
    const u = clean(patch.businessUnitId);
    if (u) await assertUnit(db, organizationId, u);
    set.businessUnitId = u;
  }
  if (patch.ackMessage !== undefined) set.ackMessage = clean(patch.ackMessage);
  if (patch.active !== undefined) set.active = patch.active;
  // Credentials: a non-empty value replaces, null clears, undefined / "" keeps.
  if (patch.channelSecret === null) set.channelSecretEnc = null;
  else if (clean(patch.channelSecret)) set.channelSecretEnc = sealSecret(clean(patch.channelSecret)!);
  if (patch.accessToken === null) {
    set.accessTokenEnc = null;
    set.tokenHint = null;
  } else if (clean(patch.accessToken)) {
    const tok = await tokenColumns(clean(patch.accessToken)!);
    set.accessTokenEnc = tok.accessTokenEnc;
    set.tokenHint = tok.tokenHint;
    set.botUserId = tok.botUserId;
    if (tok.basicId) set.basicId = tok.basicId;
  }
  const [row] = await db.update(lineChannels).set(set).where(eq(lineChannels.id, id)).returning();
  const dto = toChannelDto(row!);
  // Never log credentials — only whether they changed.
  await writeAudit(db, {
    userId,
    organizationId,
    action: "LINE_CHANNEL_UPDATED",
    entityType: "line_channel",
    entityId: id,
    oldValue: toChannelDto(before),
    newValue: { ...dto, secretChanged: "channelSecretEnc" in set, tokenChanged: "accessTokenEnc" in set },
  });
  return dto;
}

export async function deleteLineChannel(db: Db, organizationId: string, userId: string, id: string) {
  const [row] = await db
    .delete(lineChannels)
    .where(and(eq(lineChannels.id, id), eq(lineChannels.organizationId, organizationId)))
    .returning();
  if (!row) return false;
  await writeAudit(db, { userId, organizationId, action: "LINE_CHANNEL_DELETED", entityType: "line_channel", entityId: id, oldValue: toChannelDto(row) });
  return true;
}

// ---------------------------------------------------------------------------
// Incoming events

export type LineInboxEvent = {
  type?: string;
  replyToken?: string;
  webhookEventId?: string;
  timestamp?: number;
  source?: { type?: string; userId?: string };
  message?: {
    id?: string;
    type?: string;
    text?: string;
    fileName?: string;
    address?: string;
    title?: string;
  };
};

/** What the customer sent: kind + the text we can show (file name, address …). */
function messageContent(m: NonNullable<LineInboxEvent["message"]>): { kind: string; text: string | null } {
  switch (m.type) {
    case "text":
      return { kind: "text", text: (m.text ?? "").slice(0, 8000) };
    case "file":
      return { kind: "file", text: m.fileName ?? null };
    case "location":
      return { kind: "location", text: [m.title, m.address].filter(Boolean).join(" · ") || null };
    case "image":
    case "video":
    case "audio":
    case "sticker":
      return { kind: m.type, text: null };
    default:
      return { kind: "other", text: null };
  }
}

const KIND_SUBJECT: Record<string, string> = {
  image: "ส่งรูปภาพ",
  video: "ส่งวิดีโอ",
  audio: "ส่งข้อความเสียง",
  sticker: "ส่งสติกเกอร์",
  file: "ส่งไฟล์",
  location: "ส่งตำแหน่ง",
  other: "ส่งข้อความ",
};

function subjectFor(kind: string, text: string | null) {
  if (kind === "text" && text) {
    const one = text.replace(/\s+/g, " ").trim();
    return one.length > 80 ? `${one.slice(0, 79)}…` : one;
  }
  return `LINE · ${KIND_SUBJECT[kind] ?? KIND_SUBJECT.other}${text ? ` ${text.slice(0, 60)}` : ""}`;
}

async function upsertContact(db: Db, channel: DbLineChannel, token: string | null, lineUserId: string, now: Date, name?: string | null) {
  const [existing] = await db
    .select()
    .from(lineContacts)
    .where(and(eq(lineContacts.channelId, channel.id), eq(lineContacts.lineUserId, lineUserId)))
    .limit(1);
  if (existing) return existing;
  const profile = token ? await getLineProfile(token, lineUserId) : null;
  const [row] = await db
    .insert(lineContacts)
    .values({
      id: `lu_${randomUUID()}`,
      organizationId: channel.organizationId,
      channelId: channel.id,
      lineUserId,
      displayName: profile?.displayName ?? clean(name) ?? null,
      pictureUrl: profile?.pictureUrl ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: [lineContacts.channelId, lineContacts.lineUserId] })
    .returning();
  if (row) return row;
  // Lost a race with a concurrent webhook delivery.
  const [again] = await db
    .select()
    .from(lineContacts)
    .where(and(eq(lineContacts.channelId, channel.id), eq(lineContacts.lineUserId, lineUserId)))
    .limit(1);
  return again!;
}

export type InboundResult = { caseId: string; caseNo: string; created: boolean } | null;

/** One webhook event. Returns the case a message landed in (null for follow / unfollow / ignored). */
export async function processLineEvent(
  db: Db,
  channel: DbLineChannel,
  token: string | null,
  ev: LineInboxEvent,
  now = new Date(),
  /** demoImage: a built-in photo (public/demo/chat-*.webp) for seed data and the test sender — no LINE download. */
  opts: { displayName?: string | null; demoImage?: DemoChatImage } = {},
): Promise<InboundResult> {
  const lineUserId = ev.source?.userId;
  // 1:1 chats only; group / room chats are not customer cases.
  if (!lineUserId || (ev.source?.type && ev.source.type !== "user")) return null;
  const org = channel.organizationId;

  if (ev.type === "follow" || ev.type === "unfollow") {
    const contact = await upsertContact(db, channel, token, lineUserId, now, opts.displayName);
    await db
      .update(lineContacts)
      .set({ followed: ev.type === "follow", updatedAt: now })
      .where(eq(lineContacts.id, contact.id));
    return null;
  }
  if (ev.type !== "message" || !ev.message) return null;

  const messageId = clean(ev.message.id) ?? `sim-${randomUUID()}`;
  // LINE re-delivers on timeouts: the same message id is stored once.
  const [dupe] = await db
    .select({ caseId: caseEvents.caseId })
    .from(caseEvents)
    .where(and(eq(caseEvents.organizationId, org), sql`${caseEvents.data} ->> 'lineMessageId' = ${messageId}`))
    .limit(1);
  if (dupe) {
    const [c] = await db.select({ no: cases.caseNo }).from(cases).where(eq(cases.id, dupe.caseId)).limit(1);
    return { caseId: dupe.caseId, caseNo: c?.no ?? "", created: false };
  }

  const contact = await upsertContact(db, channel, token, lineUserId, now, opts.displayName);
  const { kind, text } = messageContent(ev.message);

  // Pictures / files are copied now — LINE only keeps them for a while.
  let media: { key: string; mime: string; size: number } | { url: string; mime: string } | null = null;
  if (opts.demoImage && kind === "image") media = { url: `/demo/chat-${opts.demoImage}.webp`, mime: "image/webp" };
  else if (token && (kind === "image" || kind === "file" || kind === "video" || kind === "audio") && ev.message.id) {
    const got = await getLineContent(token, ev.message.id);
    if (got) {
      const ext = got.mime.split("/")[1]?.replace(/[^a-z0-9]/gi, "").slice(0, 5) || "bin";
      const key = await saveObject(org, `line-${createHash("sha1").update(messageId).digest("hex").slice(0, 16)}.${ext}`, got.data);
      media = { key, mime: got.mime, size: got.data.length };
    }
  }

  const [open] = await db
    .select({ id: cases.id, caseNo: cases.caseNo, status: cases.status })
    .from(cases)
    .where(and(eq(cases.organizationId, org), eq(cases.lineContactId, contact.id), inArray(cases.status, [...CASE_OPEN_STATUSES])))
    .orderBy(desc(cases.updatedAt))
    .limit(1);

  let target: { id: string; caseNo: string; created: boolean };
  if (open) {
    target = { id: open.id, caseNo: open.caseNo, created: false };
    const set: Partial<typeof cases.$inferInsert> = { updatedAt: now };
    if (open.status === "waiting_customer") set.status = "in_progress";
    await db.update(cases).set(set).where(eq(cases.id, open.id));
    if (set.status) {
      await db.insert(caseEvents).values({
        id: `ce_${randomUUID()}`,
        organizationId: org,
        caseId: open.id,
        type: "status",
        data: { from: open.status, to: set.status, auto: "customer_replied" },
        createdAt: now,
      });
    }
  } else {
    const box = text ? findContainerNo(text) : null;
    const created: CaseDto = await createCase(
      db,
      org,
      null,
      {
        subject: subjectFor(kind, text),
        channel: "line",
        category: text ? guessCategory(text) : "other",
        priority: "normal",
        customerId: contact.customerId,
        contactId: contact.contactId,
        businessUnitId: channel.businessUnitId,
        containerNo: box,
        assigneeUserId: null,
        lineContactId: contact.id,
      },
      now,
    );
    target = { id: created.id, caseNo: created.caseNo, created: true };
  }

  await db.insert(caseEvents).values({
    id: `ce_${randomUUID()}`,
    organizationId: org,
    caseId: target.id,
    type: "inbound",
    body: text,
    data: { via: "line", kind, lineMessageId: messageId, channel: channel.name, ...(media ? { media } : {}) },
    createdAt: now,
  });
  await db.update(lineContacts).set({ lastMessageAt: now, followed: true, updatedAt: now }).where(eq(lineContacts.id, contact.id));

  if (target.created && token && ev.replyToken && channel.ackMessage) {
    await replyLineWith(token, ev.replyToken, channel.ackMessage.replaceAll("{case}", target.caseNo));
  }
  return { caseId: target.id, caseNo: target.caseNo, created: target.created };
}

/**
 * POST /api/webhooks/line/:key — signature checked with that channel's secret.
 * → 404 unknown / inactive / not connected, 401 bad signature, 400 bad JSON, 200 processed.
 */
export async function handleLineWebhook(db: Db, key: string, rawBody: string, signature: string | null | undefined, now = new Date()) {
  const [channel] = await db.select().from(lineChannels).where(eq(lineChannels.webhookKey, key)).limit(1);
  if (!channel || !channel.active) return { status: 404 as const, error: "unknown_channel" };
  const secret = openSecret(channel.channelSecretEnc);
  if (!secret) return { status: 404 as const, error: "line_not_connected" };
  if (!verifyLineSignature(rawBody, signature, secret)) return { status: 401 as const, error: "bad_signature" };
  let payload: { destination?: string; events?: LineInboxEvent[] };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return { status: 400 as const, error: "invalid_body" };
  }
  const token = openSecret(channel.accessTokenEnc);
  const results: InboundResult[] = [];
  for (const ev of Array.isArray(payload.events) ? payload.events : []) {
    try {
      results.push(await processLineEvent(db, channel, token, ev, now));
    } catch (e) {
      // One bad event must not make LINE retry the whole batch forever.
      console.warn("[line-inbox] event failed:", e instanceof Error ? e.message : e);
    }
  }
  await db
    .update(lineChannels)
    .set({ lastEventAt: now, ...(payload.destination && !channel.botUserId ? { botUserId: payload.destination } : {}) })
    .where(eq(lineChannels.id, channel.id));
  return { status: 200 as const, results: results.filter(Boolean) };
}

/**
 * Test sender (settings → "ลองส่งข้อความ"): behaves exactly like a customer chat on that OA,
 * without LINE — for setup checks and live demos. Nothing is sent to LINE.
 */
export async function simulateLineMessage(
  db: Db,
  organizationId: string,
  userId: string,
  channelId: string,
  input: { name: string; text: string; image?: DemoChatImage },
  now = new Date(),
) {
  const [channel] = await db
    .select()
    .from(lineChannels)
    .where(and(eq(lineChannels.id, channelId), eq(lineChannels.organizationId, organizationId)))
    .limit(1);
  if (!channel) return null;
  const name = input.name.trim();
  const lineUserId = `Usim${createHash("sha1").update(`${channelId}:${name.toLowerCase()}`).digest("hex").slice(0, 28)}`;
  const res = await processLineEvent(
    db,
    channel,
    null,
    { type: "message", source: { type: "user", userId: lineUserId }, message: { id: `sim-${randomUUID()}`, type: "text", text: input.text } },
    now,
    { displayName: name },
  );
  // Optional sample photo right after the text, like a customer sending a picture.
  if (res && input.image) {
    await processLineEvent(
      db,
      channel,
      null,
      { type: "message", source: { type: "user", userId: lineUserId }, message: { id: `sim-${randomUUID()}`, type: "image" } },
      new Date(now.getTime() + 1000),
      { displayName: name, demoImage: input.image },
    );
  }
  await writeAudit(db, { userId, organizationId, action: "LINE_TEST_MESSAGE", entityType: "line_channel", entityId: channelId, newValue: { name, caseNo: res?.caseNo } });
  return res;
}
