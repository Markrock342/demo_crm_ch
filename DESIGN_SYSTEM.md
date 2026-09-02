# DESIGN_SYSTEM.md

## 1. Project overview

- **Website / product name:** 沧栈 CANGZHAN
- **Website type:** logistics CRM demo (dashboard + product UI)
- **Surface profile:** Dashboard/Admin + App/Product UI
- **Platform:** web
- **Target users:** ปฏิบัติการและฝ่ายขายบริษัทโลจิสติกส์จีนบนเส้นจีน–ไทย
- **Main design goal:** สมุดบัญชีท่าเรือที่เอาเข้าห้องประชุมแล้วใช้งานได้ ไม่ใช่สไลด์

## 2. Brand direction

- **Visual style:** ink-and-seal ledger
- **Mood & tone:** วัดได้ · สั้น · ไม่ขายฝัน
- **Design personality:** ledger-house, measured, ink-and-seal
- **Design concept:** สมุดเสมียนท่าเรือจีน–อาเซียน — กระดาษอุ่น ตัวอักษรหมึก ตราจูซาจุดเดียว ตัวเลขตาราง ไม่ใช่กรมท่า+ทอง และไม่ใช่ทีลโลจิสติกส์
- **Adversarial-review verdict:** ถ้าปิดชื่อยังอ่านเป็นสมุดท่า ไม่ใช่ SaaS ม่วง — จุดอ่อนที่แก้แล้วคือฮีโร่เมตริกสี่กล่องเท่ากัน เหลือตัวนำ 1 + ตัวรอง 3
- **Reference style used:** web research จำกัดในรอบนี้ — ยึดสมุดบัญชีจีน / ตราประทับ / Linear density (ตารางแน่น) / Stripe restraint (ปุ่มเดียวต่อจอ)
- **Voice & UX copy:** สั้นเหมือนเสมียน จีนมาก่อน ไทยไม่แปลคำต่อคำ ปุ่มเป็นกริยาเดียว (บันทึก / ส่ง / ย้ายลาน)

## 3. Color system

| Role | Color | OKLCH | Usage |
|---|---|---|---|
| 60% — Dominant | paper | `oklch(0.955 0.018 78)` | พื้นหน้า |
| 30% — Secondary | ink / line / raised | `oklch(0.23 0.03 38)` · `oklch(0.84 0.02 72)` · `oklch(0.982 0.01 78)` | ตัวอักษร เส้นตาราง พื้นยก |
| 10% — Accent | seal | `oklch(0.46 0.15 28)` | ปุ่มหลัก โฟกัส ตรา |

- พื้น: paper เท่านั้น ไม่มีดาร์กโหมดในเดโมนี้
- ตัวอักษร: ink / ink-soft (`oklch(0.38 0.024 42)`)
- ปุ่มหลัก: seal บน on-seal
- แยกชั้นด้วยระยะและพื้น ไม่ใช้เส้นหนาข้างการ์ด
- สถานะไม่พึ่งสีอย่างเดียว — มีคำกำกับทุก pill

## 4. Typography system

- **Brand personality:** heritage ledger
- **Font family:** Noto Serif SC + Source Serif 4 (หัว) / Noto Sans SC (เนื้อ)
- **Why:** หัวเซริฟจีนอ่านเป็นสมุด ไม่ใช่แดชบอร์ดสตาร์ทอัพ
- **Type scale:** display 2.125rem · h1 1.75rem · h2 1.25rem · h3 1.0625rem · body 1rem · body-sm 0.9375rem · caption 0.8125rem
- **Body:** 16px, line-height 1.5, เนื้อ ≤ 62ch
- **Button:** 16px, ไม่ตัวพิมพ์ใหญ่ทั้งประโยค
- ตัวเลขตู้/TEU ใช้ `tabular-nums`

## 5. Spacing & layout

สเกล 4 / 8 / 12 / 16 / 24 / 32 / 48 · ไซด์บาร์ 228px · เนื้อเย็บซ้าย · กริดลาน 4 คอลัมน์

## 6. Components

ปุ่มหลักหนึ่งต่อจอ · ปุ่มรอง ghost · ตารางมี hover/selected · ฟอร์ม label บนช่อง สูง 48px · โฟกัส `:focus-visible` วง seal · ไอคอน Phosphor regular เท่านั้น

## 7. Motion

เข้าหน้า 180ms fade+8px · ปุ่มกดเลื่อน 1px · เคารพ `prefers-reduced-motion`

## 8. Accessibility

WCAG 2.2 AA · skip link · landmark · สถานะไม่ใช้สีอย่างเดียว · เป้าหมายสัมผัส ≥ 40px

## 9. Breakpoints

| Viewport | Layout |
|---|---|
| ≤ 1100px | กริดสองคอลัมน์ (จดหมาย / รายงาน) เหลือคอลัมน์เดียว |
| ≤ 1024px | ไซด์บาร์เป็น drawer · แฮมเบอร์ger · **MobileDock** 5 ช่อง (ภาพรวม / ไปป์ไลน์ / จดหมาย / งาน / เมนู) · เนื้อหา padding-bottom 72px |
| ≤ 640px | แท็บไปป์ไลน์ kanban เลื่อนแนวนอน · คอลัมน์เต็มจอ |
| ≤ 860px | แผนผังลาน 2 คอลัมน์ |

- Mobile shell: `is-mobile` class ที่ ≤1024px · drawer + backdrop · dock ใช้โทเคน seal ไม่ใช่สีม่วง
- Inbox mobile: รายการจดหมาย → แผงจดหมายเข้า → แผงฉบับร่าง (stack แนวตั้ง)

## 10. Iconography

Phosphor regular 18px · ไม่ใช้ Lucide · ไม่ใช้อิโมจิเป็นไอคอนโครง

## 11. Data & states

ทุกตารางมีว่าง · จดหมายมีส่ง/แก้/ทิ้ง · รายงานมีโหลด CSV · ข้อมูลเดโมติดป้าย ไม่ปลอมเป็นลูกค้าจริง

## 12. Anti-slop gate

ไม่มีแถบสีข้างการ์ด · ไม่มีข้อความไล่สี · ไม่มีไอคอนประกาย AI · ไม่มี Inter · ไม่มีทีล/กรมท่า+ทอง

## 13. Content rules

ข้อมูลเส้นจีน–ไทยเท่านั้น · ภาษาสวิตช์ ZH / TH / EN · เก็บใน `localStorage` คีย์ `cangzhan-demo-v3` · หน้า CRM: 管道 / 线索 / 联系人 / 任务 / 日历 / 单证 / 客户档案

## 14. Future pages

ใช้โทเคนใน `src/index.css` เท่านั้น ห้ามสีหรือขนาดหลุดสเกล
