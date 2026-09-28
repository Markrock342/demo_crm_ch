import type { ThemeConfig } from "antd";

/**
 * CANGZHAN — dockside ledger palette.
 * Hex mirrors of the OKLCH tokens in src/index.css (antd cannot derive shades from oklch()).
 */
export const palette = {
  canvas: "#f8f5f1",
  surface: "#fefdfb",
  fill: "#f2efe9",
  line: "#e3dfd8",
  lineStrong: "#cecac2",
  ink: "#142226",
  inkSoft: "#445357",
  inkFaint: "#6b777b",
  primary: "#006a70",
  primaryDeep: "#00555a",
  primarySoft: "#d7f3f5",
  accent: "#eb7c33",
  side: "#0d1f23",
  sideHover: "#182c32",
  sideActive: "#193b3f",
  sideText: "#c9d3d6",
  sideMuted: "#7c898c",
  success: "#298646",
  warning: "#da950b",
  warningText: "#975800",
  danger: "#c9302d",
  info: "#1f6cb0",
} as const;

const fontUi = `"Anuphan", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif`;

export const logisticsTheme: ThemeConfig = {
  token: {
    colorPrimary: palette.primary,
    colorSuccess: palette.success,
    colorWarning: palette.warning,
    colorError: palette.danger,
    colorInfo: palette.info,
    colorLink: palette.primary,
    colorText: palette.ink,
    colorTextSecondary: palette.inkSoft,
    colorTextTertiary: palette.inkFaint,
    colorTextQuaternary: palette.inkFaint,
    colorBorder: palette.lineStrong,
    colorBorderSecondary: palette.line,
    colorFillAlter: palette.fill,
    colorFillSecondary: palette.fill,
    colorBgLayout: palette.canvas,
    colorBgContainer: palette.surface,
    colorBgElevated: palette.surface,
    borderRadius: 8,
    borderRadiusSM: 6,
    borderRadiusLG: 10,
    fontFamily: fontUi,
    fontSize: 14,
    fontSizeHeading4: 22,
    controlHeight: 36,
    controlHeightSM: 28,
    boxShadow: "0 16px 40px rgba(20, 34, 38, 0.12)",
    boxShadowSecondary: "0 12px 32px rgba(20, 34, 38, 0.12)",
    wireframe: false,
  },
  components: {
    Layout: {
      siderBg: palette.side,
      headerBg: palette.surface,
      bodyBg: palette.canvas,
    },
    Button: {
      fontWeight: 500,
      primaryShadow: "none",
      defaultShadow: "none",
    },
    Table: {
      headerBg: palette.fill,
      headerColor: palette.inkSoft,
      headerSplitColor: "transparent",
      rowHoverBg: "#f3faf9",
      borderColor: palette.line,
      cellPaddingBlock: 12,
      cellPaddingInline: 14,
    },
    Card: {
      headerFontSize: 15,
    },
    Tag: {
      defaultBg: palette.fill,
    },
    Segmented: {
      itemSelectedBg: palette.surface,
      trackBg: palette.fill,
    },
    Tabs: {
      itemColor: palette.inkSoft,
    },
  },
};
