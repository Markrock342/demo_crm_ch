import { useCallback, useState } from "react";
import { AiError, aiBrief, type AiBriefResult, type Locale } from "../../ai/client.ts";
import { buildLocalBrief } from "../lib/localBrief.ts";

export function useAiBrief(locale: Locale) {
  const [result, setResult] = useState<AiBriefResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [missingKey, setMissingKey] = useState(false);
  const [animateKey, setAnimateKey] = useState(0);

  const run = useCallback(
    async (
      facts: Record<string, string | number | boolean>,
      localFallback: string,
      context?: string,
    ) => {
      setBusy(true);
      setMissingKey(false);
      setResult(null);
      try {
        const data = await aiBrief(locale, facts, context);
        setResult(data);
        setAnimateKey((k) => k + 1);
      } catch (e) {
        if (e instanceof AiError && e.code === "missing_key") setMissingKey(true);
        setResult(buildLocalBrief(locale, facts, localFallback));
        setAnimateKey((k) => k + 1);
      } finally {
        setBusy(false);
      }
    },
    [locale],
  );

  const reset = useCallback(() => {
    setResult(null);
    setMissingKey(false);
  }, []);

  return { result, summary: result?.summary ?? null, busy, missingKey, animateKey, run, reset };
}
