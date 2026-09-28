import { useCallback } from "react";
import { useStore } from "../../store";
import { localizeDemo } from "./demoText.ts";

/** `(s) => string` that shows sample (seed) text in the current UI language; typed text passes through. */
export function useDemoText(): (s?: string | null) => string {
  const { locale } = useStore();
  return useCallback((s?: string | null) => localizeDemo(s, locale), [locale]);
}
