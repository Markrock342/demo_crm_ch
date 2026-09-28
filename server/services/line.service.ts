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

async function call(path: string, body: unknown): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
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
