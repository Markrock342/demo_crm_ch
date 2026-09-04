import { useStore } from "../store";
import { AppProviders } from "./providers/AppProviders.tsx";
import type { ReactNode } from "react";

export function ThemedApp({ children }: { children: ReactNode }) {
  const { locale } = useStore();
  return <AppProviders locale={locale}>{children}</AppProviders>;
}
