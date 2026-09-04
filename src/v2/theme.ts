import type { ThemeConfig } from "antd";

/** CANGZHAN LogisticsOS — enterprise ops palette (no SaaS gradients). */
export const logisticsTheme: ThemeConfig = {
  token: {
    colorPrimary: "#1e4d8c",
    colorSuccess: "#237804",
    colorWarning: "#d48806",
    colorError: "#cf1322",
    colorInfo: "#0958d9",
    colorBgLayout: "#f0f2f5",
    colorBgContainer: "#ffffff",
    borderRadius: 6,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
    fontSize: 13,
    controlHeight: 32,
  },
  components: {
    Layout: {
      siderBg: "#141b2d",
      triggerBg: "#0f1524",
      headerBg: "#ffffff",
      bodyBg: "#f0f2f5",
    },
    Menu: {
      darkItemBg: "#141b2d",
      darkSubMenuItemBg: "#101626",
      darkItemSelectedBg: "#1e4d8c",
      itemHeight: 40,
    },
    Table: {
      headerBg: "#fafafa",
      cellPaddingBlock: 8,
      cellPaddingInline: 12,
    },
  },
};
