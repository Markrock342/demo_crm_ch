export type Locale = "zh" | "th" | "en";

export type MailAnalysis = {
  intent: string;
  summary: string;
  origin: string;
  dest: string;
  boxIds: string[];
  blNumbers: string[];
  docsMissing: string[];
  suggestedStatus: string;
  confidence: number;
  needsHuman: boolean;
  draftZh: string;
  draftTh: string;
  draftEn: string;
  customerId: string | null;
};

export type LedgerContext = {
  locale: Locale;
  from?: string;
  subject?: string;
  body: string;
  customers: { id: string; name: string; lane: string }[];
  boxes: { id: string; customerId: string; status: string; bl: string; dir: string; type: string }[];
};

export class AiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function readJson(res: Response) {
  const data: unknown = await res.json().catch(() => ({}));
  return data as { error?: string } & Record<string, unknown>;
}

export async function aiHealth() {
  const res = await fetch("/api/ai/health");
  const data = await readJson(res);
  return { ok: Boolean(data.ok), model: String(data.model ?? "") };
}

export async function analyzeMail(input: LedgerContext): Promise<MailAnalysis> {
  const res = await fetch("/api/ai/mail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw new AiError(String(data.error ?? "bad_request"), String(data.error ?? "bad_request"));
  }
  return data as unknown as MailAnalysis;
}

export async function aiBrief(locale: Locale, facts: Record<string, string | number | boolean>) {
  const res = await fetch("/api/ai/brief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale, facts }),
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw new AiError(String(data.error ?? "bad_request"), String(data.error ?? "bad_request"));
  }
  return String(data.summary ?? "");
}
