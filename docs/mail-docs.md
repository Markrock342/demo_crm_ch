## สถานะปัจจุบันของฟีเจอร์นี้ (Current Status)

Mail + CRM docs เก็บ metadata+body ใน PostgreSQL แล้ว — hydrate ผ่าน CrmSync และ write-through จาก store เมื่อ `apiEnabled`

## งานที่เพิ่งทำเสร็จ (Recently Completed)

- Migration `0005_mail_docs.sql` — ตาราง `mails`, `crm_docs`
- `server/services/comms.service.ts` + `server/routes/comms.ts`
- Seed จาก `mailsSeed` / `docs`
- Client `src/api/comms.ts` + store mutations + CrmSync
- Test: `mailTransitionAllowed`

## บันทึกการแก้บัค (Bug & Troubleshooting Log)

- (ยังไม่มี)

## สิ่งที่ยังค้างอยู่และปัญหาที่ทราบ (Pending & Known Issues)

- ยังไม่มี attachment storage / EmailAccount / Thread model เต็ม
- `applyMailOps` ยังคำนวณฝั่ง client แล้ว upsert docs — ยังไม่ย้าย logic ทั้งก้อนไป server
- Tasks จาก mail ops ยังไม่ persist ใน DB

## Checklist งานต่อไป (Next Steps)

- [ ] Attachment / object storage
- [ ] Server-side apply-mail-ops service
- [ ] Persist tasks จาก mail ops
