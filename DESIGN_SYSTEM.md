# DESIGN_SYSTEM.md

## 1. Project overview

- **Website / product name:** 沧栈 CANGZHAN
- **Website type:** logistics CRM / freight forwarding ops console
- **Surface profile:** Dashboard/Admin + App/Product UI (hybrid)
- **Platform:** web (React + Vite + CSS tokens)
- **Target users:** ฝ่ายปฏิบัติการและขายบริษัทโลจิสติกส์จีน–ไทย ใช้ในห้องประชุม/โต๊ะทำงานสว่าง
- **Main design goal:** ดูข้อมูลได้เยอะในจอเดียว อ่านเร็ว ไม่โล่ง — แบบ Shopee Seller Center density แต่ยังเป็นสมุดท่าเรือ ไม่ใช่ SaaS ม่วง

## 2. Brand direction

- **Visual style:** ink-and-seal ledger + ops console density
- **Mood & tone:** วัดได้ · กระชับ · ไม่ขายฝัน
- **Design personality:** ledger-house, measured, ink-and-seal
- **Design concept:** คอนโซลปฏิบัติการท่าเรือ — พื้นเทาอ่อน flat (cool slate), ตารางแน่น sticky header, filter chip มีตัเลข, accent **teal seal** (`oklch` hue 210) จุดเดียว — ไม่ใช่ cinnabar / กรมท่า+ทอง / SaaS ม่วง
- **Adversarial-review verdict:** ถ้าปิดชื่อยังอ่านเป็น ops CRM จีน–ไทย ไม่ใช่ template SaaS — จุดอ่อนที่แก้แล้ว: padding โล่ง + card-in-card + Overview dead classes; ขยาย workspace ไป Pipeline/Inbox ในรอบ UX polish
- **Reference style:** Shopee Seller Center (density, filter chips, stat strip) · Linear table rhythm · Stripe restraint (CTA เดียวต่อจอ)
- **Voice & UX copy:** สั้น · จีนมาก่อน · ปุ่มเป็นกริยา · ข้อมูลเดโมติดป้าย

## 3. Color system

| Role | Token | OKLCH | Usage |
|---|---|---|---|
| 60% — Dominant | `--canvas` | `oklch(0.962 0.014 240)` | พื้นหลัง app |
| 60% — Surface | `--paper` | `oklch(0.995 0.004 240)` | พื้น workspace / ตาราง |
| 30% — Secondary | `--ink-soft`, `--line` | `oklch(0.44 0.03 250)` · `oklch(0.91 0.012 240)` | รอง / เส้นตาราง |
| 10% — Accent | `--seal` | `oklch(0.53 0.14 210)` | ปุ่มหลัก, filter active, โฟกัส |

- ธีมสว่างเท่านั้น
- แยกชั้นด้วยพื้น + เส้นบาง ไม่ใช้ shadow หนา
- สถานะมี pill + ข้อความ ไม่พึ่งสีอย่างเดียว

## 4. Typography system

- **Font family:** IBM Plex Sans + IBM Plex Sans Thai + Noto Sans SC/TH
- **Why:** grotesque อ่านเร็วในตาราง รองรับจีน/ไทย ไม่ใช่ serif สมุดเก่า (legacy serif ถูกแทนที่ใน UI shell)
- **Type scale:** display 1.875rem · h1 1.375rem · h2 1.125rem · h3 1rem · body **1rem (16px)** · body-sm 0.875rem (ตาราง) · caption 0.75rem
- **Line-height:** 1.5 body · tabular-nums ทุกคอลัมน์ตัวเลข
- **Compact mode:** `.app.is-dense` ลด padding แถวตารางอีกชั้น (Settings → Density)

## 5. Spacing & layout

- สเกล: `--space-2xs` 4 · `--space-xs` 8 · `--space-sm`/`--space-md` 12 · `--space-lg` 16 · `--space-xl` 20 · `--space-2xl` 32
- Sidebar: **196px** · App bar: **52px**
- Content inset: **8px** (`--space-xs`) · workspace section margin ใช้ `--space-md` (12px)
- **Workspace page:** `.page.page--workspace` — toolbar บน + เนื้อเต็มความกว้าง + `table-shell` sticky header
- Split detail: `.page--split` → 220–260px list + panel ขวา

## 6. Components

| Component | Class / file | Notes |
|---|---|---|
| Page toolbar | `.page-toolbar`, `PageToolbar.tsx` | ชื่อ + count badge + hint + actions + filter chips |
| Filter chip | `.filter-chip` | pill + ตัเลข `<em>`, state `.is-on` |
| Stat strip | `.stat-strip` / `.stat-chip` | KPI แถวบาง (TEU, ตู้, รายการ) |
| Data table | `.table-shell` + `.data-table` | sticky thead, zebra, max-height scroll |
| Buttons | `.btn`, `.btn-primary`, `.btn-ghost` | min-height **32px** (workspace `--control-h`), radius 6px (`--radius-sm`) |
| Dense list | `.dense-list` | รายการลิงก์บางๆ แทน `.list-plain` ที่ไม่มี CSS |
| Rank grid | `.rank-grid` | 3 คอลัมน์ ranking บน Overview (ไม่ยืม `.job-detail-grid`) |
| Demo banner | `.demo-banner` | โหมดสาธิต + CTA login |
| Forms | `.form` | label บนช่อง, min-height 48px (ยังใช้ในฟอร์มเพิ่มข้อมูล) |

- ปุ่มหลักหนึ่งต่อจอ · โฟกัส `:focus-visible` ring seal · Phosphor regular 18px

## 7. Motion

- เข้าหน้า 200ms fade+8px · ปุ่ม active translateY(1px) · เคารพ `prefers-reduced-motion` (`.is-still`)

## 8. Accessibility

- WCAG 2.2 AA target · body 16px · caption 12px ใช้เฉพาะ label รอง
- Skip link · landmarks · filter chips ใช้ `role="tab"` / `aria-pressed` / `aria-selected`
- Touch targets ≥ 30px compact / ≥ 40px mobile dock

## 9. Breakpoints

| Viewport | Layout |
|---|---|
| ≤ 1024px | Sidebar drawer · MobileDock · ledger cards แทนตาราง |
| ≤ 900px | split-panels → stack แนวตั้ง |
| ≤ 640px | pipeline kanban เต็มจอ |

## 10. Iconography

Phosphor regular 18px · ไม่ Lucide · ไม่อิโมจิเป็นโครง

## 11. Data & states

ทุกตาราง: empty + loading + error (production) · demo มี sample data + banner · async มี toast

## 12. Anti-slop gate

ไม่มี side-stripe · ไม่ gradient text · ไม่ sparkle AI · ไม่ card-in-card ซ้อน · filter chip ไม่ใช่ segment ใหญ่โล่ง

## 13. Content rules

เส้นจีน–ไทย · ZH/TH/EN · UI prefs `cangzhan-ui-v1` · ข้อมูลเดโมไม่ปลอมเป็น production

## 14. Future pages

ใช้ `page page--workspace` + `PageToolbar` + `table-shell` สำหรับทุกหน้ารายการ · โทเคนใน `src/index.css` + `src/ui/kit.css` เท่านั้น
