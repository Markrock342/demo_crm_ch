import { App, ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import thTH from "antd/locale/th_TH";
import zhCN from "antd/locale/zh_CN";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Locale } from "../../i18n";
import { queryClient } from "../queryClient";
import { logisticsTheme } from "../theme";

function antLocale(locale: Locale) {
  if (locale === "th") return thTH;
  if (locale === "en") return enUS;
  return zhCN;
}

type Props = {
  locale: Locale;
  children: ReactNode;
};

export function AppProviders({ locale, children }: Props) {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={logisticsTheme} locale={antLocale(locale)}>
        <App>{children}</App>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
