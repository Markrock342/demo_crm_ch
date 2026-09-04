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
  const ctx = input.context?.trim() ? `Screen context: ${input.context}\n` : "";

  const prompt = `You are a senior freight forwarder ops advisor for CANGZHAN (Thailand–China FCL/LCL lanes).
${ctx}Write entirely in ${lang}. Use ONLY numbers and facts from the JSON below — never invent customers, job numbers, or amounts not present.

Produce a detailed operational intelligence report for the ops manager:

1. situation — 4–6 sentences: current state, what stands out, volume/billing/doc posture, trend vs normal week
2. risks — 2–5 bullets: concrete risks or gaps implied by the facts (empty array only if truly none)
3. recommendations — 3–5 bullets: strategic suggestions (prioritization, communication, commercial)
4. actions — 5–7 bullets: specific tasks for TODAY, each starting with a strong verb (call, chase, confirm, issue invoice, update milestone…). Include who-ish role (ops/sales/finance) when obvious
5. summary — same content formatted as readable markdown with ## section headers in ${lang}

Facts JSON:
${JSON.stringify(input.facts)}

Tone: experienced port clerk + ops lead. Direct, no marketing fluff. Be specific with the numbers from facts.`;

  const parsed = briefResultSchema.parse(await generateJson(prompt, geminiBriefJsonSchema));
  return {
    situation: parsed.situation.trim(),
    risks: parsed.risks.map((s) => s.trim()).filter(Boolean),
    recommendations: parsed.recommendations.map((s) => s.trim()).filter(Boolean),
    actions: parsed.actions.map((s) => s.trim()).filter(Boolean),
    summary: parsed.summary.trim(),
  };
}
