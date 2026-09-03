import { z } from "zod";

export const localeSchema = z.enum(["zh", "th", "en"]);

export const intentSchema = z.enum(["documents_hold", "booking", "capacity", "billing", "other"]);

export const geminiMailSchema = z.object({
  intent: intentSchema,
  summary: z.string(),
  originRaw: z.string().default(""),
  destRaw: z.string().default(""),
  boxIds: z.array(z.string()).default([]),
  blNumbers: z.array(z.string()).default([]),
    docsMissing: z.array(z.string()).default([]),
  suggestedStatus: z.enum(["hold", "sail", "yard", "clear", "empty", "none"]).default("none"),
  etaHint: z.string().default(""),
  requestedAction: z.string().default(""),
  confidence: z.coerce
    .number()
    .transform((n) => (n > 1 ? n / 100 : n))
    .pipe(z.number().min(0).max(1)),
  draftZh: z.string(),
  draftTh: z.string(),
  draftEn: z.string(),
});

export const ledgerCustomerSchema = z.object({
  id: z.string(),
  name: z.string(),
  lane: z.string(),
});

export const ledgerBoxSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  status: z.string(),
  bl: z.string(),
  dir: z.string(),
  type: z.string(),
});

export const mailRequestSchema = z.object({
  locale: localeSchema.default("zh"),
  from: z.string().default(""),
  subject: z.string().default(""),
  body: z.string().min(1),
  customers: z.array(ledgerCustomerSchema).default([]),
  boxes: z.array(ledgerBoxSchema).default([]),
});

export const mailResultSchema = z.object({
  intent: intentSchema,
  summary: z.string(),
  origin: z.string(),
  dest: z.string(),
  boxIds: z.array(z.string()),
  blNumbers: z.array(z.string()),
  docsMissing: z.array(z.string()),
  suggestedStatus: z.string(),
  confidence: z.number(),
  needsHuman: z.boolean(),
  draftZh: z.string(),
  draftTh: z.string(),
  draftEn: z.string(),
  customerId: z.string().nullable(),
});

export const briefRequestSchema = z.object({
  locale: localeSchema.default("zh"),
  facts: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

export const briefResultSchema = z.object({
  summary: z.string(),
});

export type MailRequest = z.infer<typeof mailRequestSchema>;
export type MailResult = z.infer<typeof mailResultSchema>;
export type BriefRequest = z.infer<typeof briefRequestSchema>;

export const geminiMailJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: ["documents_hold", "booking", "capacity", "billing", "other"],
    },
    summary: { type: "string" },
    originRaw: { type: "string" },
    destRaw: { type: "string" },
    boxIds: { type: "array", items: { type: "string" } },
    blNumbers: { type: "array", items: { type: "string" } },
    docsMissing: { type: "array", items: { type: "string" } },
    suggestedStatus: {
      type: "string",
      enum: ["hold", "sail", "yard", "clear", "empty", "none"],
    },
    etaHint: { type: "string" },
    requestedAction: { type: "string" },
    confidence: { type: "number" },
    draftZh: { type: "string" },
    draftTh: { type: "string" },
    draftEn: { type: "string" },
  },
  required: [
    "intent",
    "summary",
    "originRaw",
    "destRaw",
    "boxIds",
    "blNumbers",
    "docsMissing",
    "suggestedStatus",
    "confidence",
    "draftZh",
    "draftTh",
    "draftEn",
  ],
};

export const geminiBriefJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: { summary: { type: "string" } },
  required: ["summary"],
};
