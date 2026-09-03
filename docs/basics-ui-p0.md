## สถานะปัจจุบันของฟีเจอร์นี้ (Current Status)

P0 พื้นฐาน UI shell ครบลำดับ Login+แผนก → CRM → เสนอราคา → วางบิล: ชั้น `shell` + `ports` + `adapters/stub` ใหม่เท่านั้น ไม่แตะ `server/**` / `src/api/**` / Boxes·Yard·Shipments / Vercel — ข้อมูลเริ่มว่าง walkthrough ในหน่วยความจำ

## งานที่เพิ่งทำเสร็จ (Recently Completed)

- Shell session (`src/shell/session.tsx`) + Login เลือกแผนก Sales/Finance/Admin; remote login ปิด + TODO
- กรองเมนูตามแผนก (`src/shell/nav.ts`); ซ่อน Boxes/Yard/Shipments จาก nav ทุกแผนก
- Settings ส่วนผู้ใช้/บทบาท — ตารางว่าง ปุ่มเพิ่ม disabled (`not_configured`)
- CRM shell store + Customers/Contacts/Leads/Pipeline empty walkthrough
- Quote port/store + `QuoteWizard` + `QuotePublicShell` + Quotations โหมด shell (DRAFT → PENDING_APPROVAL → SENT → preview)
- Billing port/store + Invoices โหมด shell (ร่าง → ออกใบ → วางบิล → รับชำระ); ปุ่มเชื่อม API ปิด

## บันทึกการแก้บัค (Bug & Troubleshooting Log)

- [ปัญหา]: เดิม `mode === "demo"` ข้าม Login เข้าแอปทันที
- [วิธีที่ลองแก้ไปแล้ว]: บังคับมี `shellUser` หรือ auth `user` ถึงเข้า AppShell; Login ใช้เลือกแผนกแทน auto-skip

## สิ่งที่ยังค้างอยู่และปัญหาที่ทราบ (Pending & Known Issues)

- Stub remote คืน `[]` / `not_configured` — ยังไม่ต่อ API จริง
- Vendor bills ยังเป็นหน้าเดิม (ไม่ใช่ shell empty เต็มรูปแบบ)
- ข้อมูล shell ไม่ persist ข้าม refresh (ยกเว้นแผนกใน sessionStorage)

## Checklist งานต่อไป (Next Steps)

- [x] P0 Login + แผนก + CRM + Quote + Billing UI shell
- [ ] P1 stub remote เต็ม / wiring port → adapters จริงเมื่ออนุญาตเปิด API
- [ ] P2 logistics UI (Boxes/Yard/Shipments) เมื่ออยู่ในสcope
- [ ] P3 ข้อ 8 architecture replan
