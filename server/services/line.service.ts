import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * LINE Messaging API (push / reply). LINE Notify was discontinued in 2025 — this uses the
 * company's LINE Official Account instead. Everything is a no-op when the env is not set.
 */

const API = "https://api.line.me/v2/bot/message";

export function lineConfigured(): boolean {
  return Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() && process.env.LINE_CHANNEL_SECRET?.trim());
}

/** The OA's basic id (e.g. "@abc1234") so people can add it as a friend; optional. */
export function lineOaId(): string | null {
  const id = process.env.LINE_OA_ID?.trim();
  if (!id) return null;
  return id.startsWith("@") ? id : `@${id}`;
}

/** X-Line-Signature = base64(HMAC-SHA256(channelSecret, rawBody)). */
export function verifyLineSignature(rawBody: string, signature: string | undefined | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** `token` = a LINE inbox channel's token; default = the notifications OA from the env. */
async function call(path: string, body: unknown, token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim()): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch(`${API}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.warn(`[line] ${path} failed: ${res.status} ${await res.text().catch(() => "")}`);
    return res.ok;
  } catch (e) {
    console.warn(`[line] ${path} error:`, e instanceof Error ? e.message : e);
    return false;
  }
}

/** LINE text messages are capped at 5000 chars. */
function textMessage(text: string) {
  return { type: "text", text: text.slice(0, 4900) };
}

export function pushLine(to: string, text: string): Promise<boolean> {
  return call("push", { to, messages: [textMessage(text)] });
}

export function replyLine(replyToken: string, text: string): Promise<boolean> {
  return call("reply", { replyToken, messages: [textMessage(text)] });
}

// ---------------------------------------------------------------------------
// LINE inbox (customer chats on company OAs; each channel has its own token)

export type LineSendResult = { ok: boolean; error: string | null };

/** Push a text to one LINE user through a given OA, keeping LINE's error for the case timeline. */
export async function pushLineWith(token: string, to: string, text: string): Promise<LineSendResult> {
  try {
    const res = await fetch(`${API}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [textMessage(text)] }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { ok: true, error: null };
    const detail = await res.text().catch(() => "");
    let msg = `http_${res.status}`;
    try {
      const j = JSON.parse(detail) as { message?: string };
      if (j.message) msg = j.message.slice(0, 200);
    } catch {
      /* keep the status code */
    }
    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "network_error" };
  }
}

export type LineBotInfo = { userId: string; basicId: string | null; displayName: string | null; pictureUrl: string | null };

/** GET /v2/bot/info — checks a token and returns the OA's ids (null when the token is rejected). */
export async function getLineBotInfo(token: string): Promise<LineBotInfo | null> {
  try {
    const res = await fetch("https://api.line.me/v2/bot/info", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { userId?: string; basicId?: string; displayName?: string; pictureUrl?: string };
    if (!j.userId) return null;
    return { userId: j.userId, basicId: j.basicId ?? null, displayName: j.displayName ?? null, pictureUrl: j.pictureUrl ?? null };
  } catch {
    return null;
  }
}

/** A friend's display name + picture (null when blocked / not a friend / network error). */
export async function getLineProfile(token: string, userId: string): Promise<{ displayName: string | null; pictureUrl: string | null } | null> {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { displayName?: string; pictureUrl?: string };
    return { displayName: j.displayName ?? null, pictureUrl: j.pictureUrl ?? null };
  } catch {
    return null;
  }
}

/** Image / file bytes a customer sent (LINE keeps them for a limited time). Max 10 MB. */
export async function getLineContent(token: string, messageId: string): Promise<{ data: Buffer; mime: string } | null> {
  try {
    const res = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > 10 * 1024 * 1024) return null;
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > 10 * 1024 * 1024) return null;
    return { data, mime: res.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream" };
  } catch {
    return null;
  }
}

/** Free reply (only within LINE's reply-token window, right after the customer's message). */
export function replyLineWith(token: string, replyToken: string, text: string): Promise<boolean> {
  return call("reply", { replyToken, messages: [textMessage(text)] }, token);
}
