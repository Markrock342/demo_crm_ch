/**
 * Outbound e-mail transports.
 *
 * EMAIL_TRANSPORT=sandbox (default) keeps mail in an in-memory outbox and never delivers it —
 * safe for development. EMAIL_TRANSPORT=smtp delivers through nodemailer using
 * SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_SECURE and MAIL_FROM.
 * A misconfigured SMTP setup never silently falls back to the sandbox: sending fails with
 * `smtp_not_configured` so the UI shows the mail as failed.
 */

export type MailAttachment = {
  filename: string;
  content: Uint8Array;
  contentType?: string;
};

export type OutboundMail = {
  to: string | string[];
  cc?: string[];
  subject: string;
  /** Plain-text body. */
  body: string;
  html?: string;
  replyTo?: string;
  attachments?: MailAttachment[];
  mailId?: string;
  jobId?: string;
  customerId?: string;
};

export type SendResult = {
  /** Kept for older callers: the sandbox id or the SMTP message id. */
  sandboxId: string;
  messageId: string;
  status: "sandbox_queued" | "sent";
  transport: string;
};

export type MailTransport = {
  readonly name: string;
  send(draft: OutboundMail): Promise<SendResult>;
};

export class MailConfigError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super("smtp_not_configured");
    this.missing = missing;
  }
}

type Env = Record<string, string | undefined>;

export type MailConfig =
  | { mode: "sandbox"; from: string }
  | {
      mode: "smtp";
      from: string;
      host: string;
      port: number;
      secure: boolean;
      user?: string;
      pass?: string;
    }
  | { mode: "invalid"; requested: string; missing: string[] };

const truthy = (v: string | undefined) => /^(1|true|yes|on)$/i.test((v ?? "").trim());

/** Reads the mail settings from the environment (pure — used by tests). */
export function resolveMailConfig(env: Env = process.env): MailConfig {
  const requested = (env.EMAIL_TRANSPORT || "sandbox").trim().toLowerCase();
  const from = env.MAIL_FROM?.trim() || "";
  if (requested === "sandbox" || requested === "") return { mode: "sandbox", from: from || "no-reply@sandbox.local" };
  if (requested !== "smtp") return { mode: "invalid", requested, missing: ["EMAIL_TRANSPORT"] };

  const host = env.SMTP_HOST?.trim() || "";
  const missing: string[] = [];
  if (!host) missing.push("SMTP_HOST");
  if (!from) missing.push("MAIL_FROM");
  const user = env.SMTP_USER?.trim() || undefined;
  const pass = env.SMTP_PASS ?? undefined;
  if (user && !pass) missing.push("SMTP_PASS");
  if (missing.length) return { mode: "invalid", requested, missing };

  const port = Number(env.SMTP_PORT?.trim() || "") || 587;
  const secure = env.SMTP_SECURE?.trim() ? truthy(env.SMTP_SECURE) : port === 465;
  return { mode: "smtp", from, host, port, secure, user, pass: user ? pass : undefined };
}

// ---------------------------------------------------------------------------
// Sandbox

type OutboxEntry = Omit<OutboundMail, "attachments"> & SendResult & { at: string; attachments: string[] };
const outbox: OutboxEntry[] = [];

export function getSandboxOutbox() {
  return [...outbox];
}

export class SandboxMailTransport implements MailTransport {
  readonly name = "sandbox";
  async send(draft: OutboundMail): Promise<SendResult> {
    const id = `sbx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const result: SendResult = { sandboxId: id, messageId: id, status: "sandbox_queued", transport: "sandbox" };
    outbox.unshift({ ...draft, ...result, attachments: (draft.attachments ?? []).map((a) => a.filename), at: new Date().toISOString() });
    if (outbox.length > 200) outbox.length = 200;
    return result;
  }
}

// ---------------------------------------------------------------------------
// SMTP (nodemailer)

export class SmtpMailTransport implements MailTransport {
  readonly name = "smtp";
  private transporter: Promise<{ sendMail: (o: Record<string, unknown>) => Promise<{ messageId?: string }> }> | null = null;

  private readonly cfg: Extract<MailConfig, { mode: "smtp" }>;
  constructor(cfg: Extract<MailConfig, { mode: "smtp" }>) {
    this.cfg = cfg;
  }

  private get() {
    this.transporter ??= import("nodemailer").then((m) =>
      m.default.createTransport({
        host: this.cfg.host,
        port: this.cfg.port,
        secure: this.cfg.secure,
        auth: this.cfg.user ? { user: this.cfg.user, pass: this.cfg.pass } : undefined,
        connectionTimeout: 15_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
      }),
    );
    return this.transporter;
  }

  async send(draft: OutboundMail): Promise<SendResult> {
    const t = await this.get();
    const info = await t.sendMail({
      from: this.cfg.from,
      to: draft.to,
      cc: draft.cc?.length ? draft.cc : undefined,
      replyTo: draft.replyTo,
      subject: draft.subject,
      text: draft.body,
      html: draft.html,
      attachments: (draft.attachments ?? []).map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content),
        contentType: a.contentType,
      })),
    });
    const messageId = info.messageId ?? "";
    return { sandboxId: messageId, messageId, status: "sent", transport: "smtp" };
  }
}

/** Always fails — used when EMAIL_TRANSPORT asks for something that is not configured. */
class MisconfiguredTransport implements MailTransport {
  readonly name = "invalid";
  private readonly missing: string[];
  constructor(missing: string[]) {
    this.missing = missing;
  }
  async send(): Promise<SendResult> {
    throw new MailConfigError(this.missing);
  }
}

let override: MailTransport | null = null;

/** Tests: force a transport (pass null to go back to env-based selection). */
export function setMailTransportForTests(t: MailTransport | null) {
  override = t;
}

let cached: { key: string; transport: MailTransport } | null = null;

export function createMailTransport(env: Env = process.env): MailTransport {
  if (override) return override;
  const cfg = resolveMailConfig(env);
  const key = JSON.stringify(cfg);
  if (cached?.key === key) return cached.transport;
  let transport: MailTransport;
  if (cfg.mode === "smtp") transport = new SmtpMailTransport(cfg);
  else if (cfg.mode === "sandbox") transport = new SandboxMailTransport();
  else {
    console.warn(`[mail] EMAIL_TRANSPORT=${cfg.requested} is missing ${cfg.missing.join(", ")} — outbound mail will fail`);
    transport = new MisconfiguredTransport(cfg.missing);
  }
  cached = { key, transport };
  return transport;
}

/** The From address outbound mail uses. */
export function mailFromAddress(env: Env = process.env) {
  const cfg = resolveMailConfig(env);
  return cfg.mode === "invalid" ? env.MAIL_FROM?.trim() || "" : cfg.from;
}
