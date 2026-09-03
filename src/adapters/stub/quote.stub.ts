import type { QuotePort } from "../../ports/quote.port.ts";
import { NotConfiguredError } from "../../ports/auth.port.ts";

export const quoteStub: QuotePort = {
  async list() {
    return [];
  },
  async get() {
    return null;
  },
};

export async function connectQuoteRemote(): Promise<never> {
  throw new NotConfiguredError();
}
