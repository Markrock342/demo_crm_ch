import { generateJson } from "./gemini.js";
import { formatPort, normalizeDoc, normalizePort } from "./ports.js";
import {
  briefRequestSchema,
  briefResultSchema,
  geminiBriefJsonSchema,
  geminiMailJsonSchema,
  geminiMailSchema,
  mailRequestSchema,
  mailResultSchema,
  type BriefRequest,
  type MailRequest,
  type MailResult,
} from "./schema.js";

const BOX_RE = /\b([A-Z]{3}U\d{7})\b/g;

export async function analyzeLaneMail(raw: MailRequest): Promise<MailResult> {
  const input = mailRequestSchema.parse(raw);
  const ledgerIds = new Set(input.boxes.map((b) => b.id.toUpperCase()));
  const prompt = `You are the ops clerk for CANGZHAN, a Thailand–China freight ledger.
Extract facts from the email. Do not invent container numbers, B/L numbers, or customer names.
Only use box ids from the ledger below. If a number is not on the ledger, omit it.
Drafts must be short, like a clerk, in Chinese, Thai, and English. Do not claim the mail was sent.
Never tell the user to click send — the human will send.
If papers (C/O, B/L) are missing, intent is documents_hold and suggestedStatus is hold.

Ledger customers:
${input.customers.map((c) => `- ${c.id} | ${c.name} | ${c.lane}`).join("\n") || "(none)"}

Ledger boxes:
${input.boxes.map((b) => `- ${b.id} | ${b.type} | ${b.dir} | ${b.status} | BL ${b.bl} | ${b.customerId}`).join("\n") || "(none)"}

Email from: ${input.from}
Subject: ${input.subject}
Body:
${input.body}
`;

  const parsed = geminiMailSchema.parse(await generateJson(prompt, geminiMailJsonSchema));
  const fromBody = [...input.body.toUpperCase().matchAll(BOX_RE)].map((m) => m[1].toUpperCase());
  const claimed = [...parsed.boxIds, ...fromBody].map((id) => id.toUpperCase().replaceAll(/[^A-Z0-9]/g, ""));
  const boxIds = [...new Set(claimed.filter((id) => ledgerIds.has(id)))];

  const origin = formatPort(normalizePort(parsed.originRaw), input.locale);
  const dest = formatPort(normalizePort(parsed.destRaw), input.locale);
  const docsMissing = [...new Set(parsed.docsMissing.map(normalizeDoc).filter(Boolean))];

  let confidence = parsed.confidence;
  if (parsed.boxIds.some((id) => !ledgerIds.has(id.toUpperCase()))) confidence = Math.min(confidence, 0.55);
  if (boxIds.length === 0 && parsed.intent === "documents_hold") confidence = Math.min(confidence, 0.6);

  const byBox = input.boxes.find((b) => boxIds.includes(b.id.toUpperCase()));
  const customerId = byBox?.customerId ?? null;
  const needsHuman = confidence < 0.7 || parsed.intent === "documents_hold";

  return mailResultSchema.parse({
    intent: parsed.intent,
    summary: parsed.summary.trim(),
    origin,
    dest,
    boxIds,
    blNumbers: parsed.blNumbers.map((x) => x.trim()).filter(Boolean),
    docsMissing,
    suggestedStatus: parsed.suggestedStatus,
    confidence,
    needsHuman,
    draftZh: parsed.draftZh.trim(),
    draftTh: parsed.draftTh.trim(),
    draftEn: parsed.draftEn.trim(),
    customerId,
  });
}

export async function summarizeFacts(raw: BriefRequest) {
  const input = briefRequestSchema.parse(raw);
  const lang = input.locale === "th" ? "Thai" : input.locale === "en" ? "English" : "Simplified Chinese";
  const prompt = `Write a 2–3 sentence ops brief in ${lang} using ONLY these facts. Do not invent numbers or names.
Facts JSON:
${JSON.stringify(input.facts)}
Tone: port clerk, Thailand–China lane. No marketing.`;
  const parsed = briefResultSchema.parse(await generateJson(prompt, geminiBriefJsonSchema));
  return { summary: parsed.summary.trim() };
}
