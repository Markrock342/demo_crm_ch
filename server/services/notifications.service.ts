import { randomInt } from "node:crypto";
import { and, count, desc, eq, gt, isNull, lt } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { notificationChannels, notifications } from "../db/schema/index.js";
import { lineConfigured, lineOaId, replyLine } from "./line.service.js";

export type NotificationDto = {
  id: string;
  kind: string;
  title: string;
  body: string;
  params: Record<string, string | number | null>;
  refType: string | null;
  refId: string | null;
  href: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
};

function toDto(r: typeof notifications.$inferSelect): NotificationDto {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    params: r.params ?? {},
    refType: r.refType,
    refId: r.refId,
    href: r.href,
    read: Boolean(r.readAt),
    readAt: r.readAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

const mine = (organizationId: string, userId: string) =>
  and(eq(notifications.organizationId, organizationId), eq(notifications.userId, userId));

export async function listNotifications(
  db: Db,
  organizationId: string,
  userId: string,
  opts: { unreadOnly?: boolean; limit?: number; before?: Date | null } = {},
): Promise<{ items: NotificationDto[]; unread: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 300);
  const where = and(
    mine(organizationId, userId),
    opts.unreadOnly ? isNull(notifications.readAt) : undefined,
    opts.before ? lt(notifications.createdAt, opts.before) : undefined,
  );
  const rows = await db.select().from(notifications).where(where).orderBy(desc(notifications.createdAt)).limit(limit);
  return { items: rows.map(toDto), unread: await unreadCount(db, organizationId, userId) };
}

export async function unreadCount(db: Db, organizationId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(mine(organizationId, userId), isNull(notifications.readAt)));
  return Number(row?.n ?? 0);
}

/** Marks one of the user's notifications read; null when it isn't theirs. */
export async function markRead(db: Db, organizationId: string, userId: string, id: string): Promise<NotificationDto | null> {
  const [existing] = await db
    .select()
    .from(notifications)
    .where(and(mine(organizationId, userId), eq(notifications.id, id)));
  if (!existing) return null;
  if (existing.readAt) return toDto(existing);
  const [row] = await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id)).returning();
  return toDto(row!);
}

export async function markAllRead(db: Db, organizationId: string, userId: string): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(mine(organizationId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return rows.length;
}

// ---------------------------------------------------------------------------
// LINE linking

export type LineChannelDto = {
  available: boolean;
  oaId: string | null;
  linked: boolean;
  linkedAt: string | null;
  enabled: boolean;
  code: string | null;
  codeExpiresAt: string | null;
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_TTL_MS = 30 * 60 * 1000;

export function generateLinkCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

/** Pulls a link code out of a chat message ("LINK AB23CD", "ab23cd", "รหัส AB23CD"). */
export function extractLinkCode(text: string): string | null {
  const m = /^(?:LINK|CODE|รหัส)?\s*[:#-]?\s*([A-HJ-NP-Z2-9]{6})$/.exec(text.toUpperCase().trim());
  return m ? m[1]! : null;
}

async function lineRow(db: Db, organizationId: string, userId: string) {
  const [row] = await db
    .select()
    .from(notificationChannels)
    .where(
      and(
        eq(notificationChannels.organizationId, organizationId),
        eq(notificationChannels.userId, userId),
        eq(notificationChannels.channel, "line"),
      ),
    );
  return row ?? null;
}

export async function getLineChannel(db: Db, organizationId: string, userId: string): Promise<LineChannelDto> {
  const row = await lineRow(db, organizationId, userId);
  const codeLive = row?.linkCode && row.linkCodeExpiresAt && row.linkCodeExpiresAt > new Date();
  return {
    available: lineConfigured(),
    oaId: lineOaId(),
    linked: Boolean(row?.address),
    linkedAt: row?.linkedAt?.toISOString() ?? null,
    enabled: row?.enabled ?? true,
    code: codeLive ? row!.linkCode : null,
    codeExpiresAt: codeLive ? row!.linkCodeExpiresAt!.toISOString() : null,
  };
}

export async function createLineLinkCode(db: Db, organizationId: string, userId: string): Promise<LineChannelDto> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateLinkCode();
    const expires = new Date(Date.now() + CODE_TTL_MS);
    try {
      await db
        .insert(notificationChannels)
        .values({ organizationId, userId, channel: "line", linkCode: code, linkCodeExpiresAt: expires })
        .onConflictDoUpdate({
          target: [notificationChannels.organizationId, notificationChannels.userId, notificationChannels.channel],
          set: { linkCode: code, linkCodeExpiresAt: expires, updatedAt: new Date() },
        });
      return getLineChannel(db, organizationId, userId);
    } catch (e) {
      // unique(link_code) collision — try another code
      if (attempt === 4) throw e;
    }
  }
  return getLineChannel(db, organizationId, userId);
}

export async function setLineEnabled(db: Db, organizationId: string, userId: string, enabled: boolean): Promise<LineChannelDto> {
  await db
    .update(notificationChannels)
    .set({ enabled, updatedAt: new Date() })
    .where(
      and(
        eq(notificationChannels.organizationId, organizationId),
        eq(notificationChannels.userId, userId),
        eq(notificationChannels.channel, "line"),
      ),
    );
  return getLineChannel(db, organizationId, userId);
}

export async function unlinkLine(db: Db, organizationId: string, userId: string): Promise<LineChannelDto> {
  await db
    .delete(notificationChannels)
    .where(
      and(
        eq(notificationChannels.organizationId, organizationId),
        eq(notificationChannels.userId, userId),
        eq(notificationChannels.channel, "line"),
      ),
    );
  return getLineChannel(db, organizationId, userId);
}

/** Links a LINE userId to the account whose live code matches. Returns the linked user, or null. */
export async function linkLineByCode(db: Db, code: string, lineUserId: string) {
  const [row] = await db
    .update(notificationChannels)
    .set({ address: lineUserId, linkedAt: new Date(), linkCode: null, linkCodeExpiresAt: null, enabled: true, updatedAt: new Date() })
    .where(
      and(
        eq(notificationChannels.channel, "line"),
        eq(notificationChannels.linkCode, code),
        gt(notificationChannels.linkCodeExpiresAt, new Date()),
      ),
    )
    .returning({ organizationId: notificationChannels.organizationId, userId: notificationChannels.userId });
  return row ?? null;
}

type LineEvent = {
  type?: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
};

/** Handles webhook events: a text message carrying a link code links that LINE user. */
export async function handleLineEvents(db: Db, events: LineEvent[]): Promise<{ linked: { organizationId: string; userId: string }[] }> {
  const linked: { organizationId: string; userId: string }[] = [];
  for (const ev of events) {
    const lineUserId = ev.source?.userId;
    if (!lineUserId) continue;
    if (ev.type === "follow" && ev.replyToken) {
      await replyLine(ev.replyToken, "สวัสดีครับ ส่งรหัส 6 หลักจากหน้า ตั้งค่า > การแจ้งเตือน ในระบบ เพื่อรับการแจ้งเตือนทาง LINE");
      continue;
    }
    if (ev.type !== "message" || ev.message?.type !== "text") continue;
    const code = extractLinkCode(ev.message.text ?? "");
    if (!code) continue;
    const row = await linkLineByCode(db, code, lineUserId);
    if (row) linked.push(row);
    if (ev.replyToken) {
      await replyLine(
        ev.replyToken,
        row
          ? "เชื่อมต่อสำเร็จ คุณจะได้รับการแจ้งเตือนจากระบบทาง LINE นี้"
          : "รหัสไม่ถูกต้องหรือหมดอายุ กรุณาสร้างรหัสใหม่ในหน้า ตั้งค่า > การแจ้งเตือน",
      );
    }
  }
  return { linked };
}
