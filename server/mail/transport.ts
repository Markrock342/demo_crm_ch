export type OutboundMail = {
  to: string;
  subject: string;
  body: string;
  mailId?: string;
  jobId?: string;
  customerId?: string;
};

export type SendResult = {
  sandboxId: string;
  status: "sandbox_queued" | "sent";
  transport: string;
};

export type MailTransport = {
  send(draft: OutboundMail): Promise<SendResult>;
};

const outbox: Array<OutboundMail & SendResult & { at: string }> = [];

export function getSandboxOutbox() {
  return [...outbox];
}

export class SandboxMailTransport implements MailTransport {
  async send(draft: OutboundMail): Promise<SendResult> {
    const result: SendResult = {
      sandboxId: `sbx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: "sandbox_queued",
      transport: "sandbox",
    };
    outbox.unshift({ ...draft, ...result, at: new Date().toISOString() });
    if (outbox.length > 200) outbox.length = 200;
    return result;
  }
}

export function createMailTransport(): MailTransport {
  const mode = (process.env.EMAIL_TRANSPORT || "sandbox").toLowerCase();
  // SMTP/Gmail hooks Deferred — always sandbox unless extended later
  if (mode !== "sandbox") {
    console.warn(`[mail] EMAIL_TRANSPORT=${mode} not implemented; using sandbox`);
  }
  return new SandboxMailTransport();
}
