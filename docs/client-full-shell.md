## สถานะปัจจุบันของฟีเจอร์นี้ (Current Status)

Client full shell ใช้งานได้จริงบนหน่วยความจำ + localStorage: densify UI, แผนก Ops, Logistics (Box/Shipment/Yard), Quote→Job→Shipment→Billing, โมดูลรอง Rates/Tasks/Docs/Vendor bills — ยังไม่ต่อ API/DB

## งานที่เพิ่งทำเสร็จ (Recently Completed)

- UI density: บีบ `.content` / toolbar / `.app.is-dense` / table viewport
- แผนก Ops + nav ตามมติ (Sales อ่าน Boxes/Shipments · Yard = Ops+Admin · home Ops = `/yard`)
- `persist.ts` + seed เล็ก CRM/Ops; stores ลง localStorage
- Logistics shell บน Boxes / Shipments / Yard
- Quote หลาย charges + รับ/ปฏิเสธ · Job จาก quote · สร้าง shipment/invoice จาก job
- Rates / Tasks / Docs checklist / Vendor bills stub บน shell
- หน้าเดิมที่เคย import `src/api` (Jobs, Rates, Quotations, Invoices, VendorBills) สลับเป็น port/shell เมื่ออยู่ในโหมด shell — ไม่แก้ไฟล์ใต้ `src/api/**` / `server/**`

## บันทึกการแก้บัค (Bug & Troubleshooting Log)

- [ปัญหา]: P0 empty shell ไม่มี logistics / ไม่ persist
- [วิธีที่ลองแก้ไปแล้ว]: seed + localStorage + แผนก Ops + เชื่อม commercial↔ops ใน memory

## สิ่งที่ยังค้างอยู่และปัญหาที่ทราบ (Pending & Known Issues)

- Remote stub ยัง `[]` / `not_configured` — ยังไม่เสียบ API จริง
- Inbox / Reports เต็มยังนอกสcope
- ผู้ใช้ที่เคย login shell เก่าอาจต้องเลือกแผนกใหม่ถ้า session ไม่มี `ops`

## Checklist งานต่อไป (Next Steps)

- [x] UI density + Ops + Logistics shell + Quote↔Job↔Bill + โมดูลรอง
- [ ] P5 stub → API adapters จริง (เมื่ออนุญาตเปิด `src/api` / server)
- [ ] Inbox / Reports เต็ม
- [ ] Vercel DB / architecture replan
