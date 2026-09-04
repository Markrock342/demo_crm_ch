# UX polish — workspace pattern alignment

> อัปเดต: 4 กันยายน 2569  
> สถานะ: **Done** (Overview-first + P0 cascade Account/Quotations/Invoices/Portal/Notifications)

## Goal

แก้จุดเพี้ยน UX/UI ให้เข้า design system จริง (cool slate + teal seal) โดยไม่รีแบรนด์ — toolbar → `stat-strip` → dense list / `table-shell`  
**ไม่เปลี่ยนข้อมูล/business logic** ของแต่ละหน้า — เปลี่ยนเฉพาะโครง UI, คลาส, และ copy i18n

## Done

| Area | Change |
|------|--------|
| Design context | `.better-web-ui.md` + `DESIGN_SYSTEM.md` + `.impeccable.md` ซิงก์กับโทเคนจริง |
| Overview | `stat-strip` + AR strip · `dense-list` · `rank-grid` · i18n · primary CTA เดียว |
| Chrome | `bar-mark` flat · search `radius-sm` · Inbox CTA ghost/secondary · Phosphor regular |
| JobDetail | `panel`/`list-plain`/`kpi-row` → `block` / `dense-list` / `stat-strip` |
| Pipeline | เลิก card-in-card คอลัมน์ |
| Automation / Docs | workspace `block` + `dense-list` |
| Account | `page--account` · tab i18n · `stat-strip` · `dense-list` |
| Quotations / Wizard / Public shell | `pick-list` / `dense-list` / `stat-strip` / `block` |
| Invoices | billing notes + payment เป็น `block` · ลด dual primary |
| Portal / Notifications | `PageToolbar` · `dense-list` · ไม่ใช้ inline layout |
| **Page title stability** | `PageToolbar` โครงคงที่ · workspace ไม่ `translateY` ตอนเข้าหน้า · filter-row input สูงคงที่ (Rates) |
| Pipeline hint | ใช้ `pipelineHint` แทน `emptyShellCrm` |
| **Rates filter + table** | ย้าย Origin/Destination เข้า toolbar เป็น `.filter-field` สูง 32px · ตาราง `table-layout: fixed` + คอลัมน์ตัวเลขชิดขวา |
| **Sidebar scroll** | `.side-scroll` เลื่อนเมนูแยกจาก `.content` · `side-foot` ค้างล่าง · `.app` ล็อก `100svh` |
| **Main content scroll fix** | `.content > .page` ไม่ถูก stretch+clip · `page--workspace` ไม่ `overflow: hidden` ทั้งก้อน |

## Patterns to reuse

- `.stat-strip` / `.stat-chip` — KPI แถบบาง
- `.dense-list` — รายการลิงก์/ค่า
- `.pick-list` — รายการเลือกใน split panel (คู่กับ `.list-btn`)
- `.rank-grid` — 3 คอลัมน์ ranking
- `.block` + `.block-head` — ส่วนย่อยโดยไม่ซ้อน card
- `.panel` — **เฉพาะ** ใน `.split-panels` เท่านั้น

## Still open (ไม่บล็อก)

- Exception kinds / Login dept / Settings label บางจุดยัง EN hardcode
- JobDetail มีหลายปุ่ม primary ในฟอร์มย่อย (submit ตาม section)
- ต่อ API / Vercel DB / SMTP (Deferred LCS)
