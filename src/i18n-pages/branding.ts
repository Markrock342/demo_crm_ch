// White-label branding: vendor credit, company logo previews (Settings › Company). Prefix: brand_

const zh: Record<string, string> = {
  brand_vendor: "系统提供：LimitCode Studio",
  brand_logoHint: "PNG 或 JPG，不超过 1 MB。透明背景、方形或横版均可",
  brand_logoWhere: "显示在侧边菜单、登录页、客户门户、浏览器标签和单据上",
  brand_preview: "预览",
  brand_previewSidebar: "侧边菜单",
  brand_previewCollapsed: "收起菜单",
  brand_previewTab: "浏览器标签",
  brand_noLogo: "未上传标志时显示公司名首字母",
};

const th: Record<string, string> = {
  brand_vendor: "ระบบโดย LimitCode Studio",
  brand_logoHint: "PNG หรือ JPG ไม่เกิน 1 MB ใช้พื้นโปร่งใส ทรงสี่เหลี่ยมหรือแนวนอนก็ได้",
  brand_logoWhere: "แสดงที่แถบเมนู หน้าเข้าสู่ระบบ พอร์ทัลลูกค้า แท็บเบราว์เซอร์ และเอกสาร",
  brand_preview: "ตัวอย่าง",
  brand_previewSidebar: "แถบเมนู",
  brand_previewCollapsed: "เมนูแบบย่อ",
  brand_previewTab: "แท็บเบราว์เซอร์",
  brand_noLogo: "ยังไม่มีโลโก้ ระบบจะใช้ตัวอักษรแรกของชื่อบริษัท",
};

const en: Record<string, string> = {
  brand_vendor: "System by LimitCode Studio",
  brand_logoHint: "PNG or JPG, up to 1 MB. Transparent background; square or wide both work",
  brand_logoWhere: "Shown in the side menu, sign-in page, customer portal, browser tab and documents",
  brand_preview: "Preview",
  brand_previewSidebar: "Side menu",
  brand_previewCollapsed: "Collapsed menu",
  brand_previewTab: "Browser tab",
  brand_noLogo: "No logo yet — the company's first letter is used",
};

export default { zh, th, en };
