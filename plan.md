# สรุปงาน CANGZHAN / demo_crm_ch

> อัปเดต: 3 กันยายน 2569 (sprint ปิด backlog — Demo แบบเต็มรูปแบบ)  
> Repo: `demo_crm_ch` · Deploy: `democrmch.vercel.app`  
> Branch: work from `38111e3` + backlog close

---

## ภาพรวม

โปรเจกต์ CRM โลจิสติกส์จีน–ไทย (货代) — Vite + React + Hono + PostgreSQL  
เป้าหมายรอบนี้: **API/`DATABASE_URL` เป็นหลัก** · Vendor Bills from-job+อนุมัติ · mail/docs ลง PG · เลิกพึ่ง `customers.boxes`

ดูแผนที่สถาปัตยกรรม: [`docs/index.md`](docs/index.md)

---

## สถานะปัจจุบัน

| รายการ | สถานะ |
|---|---|
| Workspace UI / density / ui-component (รอบก่อน) | ✅ |
| Containers / Milestones / Customer commercial strip | ✅ |
| Foundation: migrate txn + PgBouncer compose + pool docs | ✅ |
| Derive/drop `customers.boxes` | ✅ (`0004`) |
| Vendor Bills API + UI (from-job + approve) | ✅ |
| Mail/docs persistence (metadata+body) | ✅ (`0005`) |
| Vercel `DATABASE_URL` + migrate/seed prod | ⏳ รอตั้ง env (`/api/health` ยัง `mode: demo`) |
| Architecture replan (ข้อ 8) | ⏸ หลังรอบนี้ |

---

## Backlog — ปิดในรอบนี้แล้ว

1. ~~Vendor Bills / AP UI~~ → from-job + approve (ยังไม่จ่ายเงิน)
2. ~~Customer 360~~ → ใช้ API จริงที่มี (ไม่ขยายแท็บ)
3. ~~Email/docs persistence~~ → PostgreSQL metadata+body
4. ~~Drop `customers.boxes`~~ → นับจาก `containers`
5. ~~PgBouncer~~ → compose local + เอกสาร pooled URL บน Vercel
6. ui-component ต่อบนหน้าที่แตะ (Account / Vendor Bills / Jobs links)
7. Production verify — โค้ดพร้อม; **ต้องตั้ง `DATABASE_URL` บน Vercel แล้วรัน migrate/seed**

---

## Migrations ใหม่

- `0004_vendor_bills_and_boxes.sql` — `billed`, AP columns, drop `customers.boxes`
- `0005_mail_docs.sql` — `mails`, `crm_docs`

---

## ยังนอกสcope / ถัดไป

- AP payment / allocation, credit notes
- Attachments, server-side mail-ops, tasks persistence
- Reports จาก DB aggregates, AI `/api/ai/query`
- วิเคราะห์สถาปัตยกรรมเต็มรูปแบบ (ข้อ 8)

---

## Production Setup

```bash
# ใช้ pooled connection string + DB_POOL_MAX=1 บน Vercel
DATABASE_URL=<prod-pooled> npm run db:migrate
DATABASE_URL=<prod-pooled> npm run db:seed
```

Local PgBouncer: `docker compose up -d` แล้วชี้ `DATABASE_URL` ไป `localhost:6432`

---

## Design Principles (จาก `.impeccable.md`)

1. ภาษาจีนมาก่อน · ไทย/EN สวิตช์
2. ตัวเลข TEU/ตู้ — tabular-nums เสมอ
3. การ์ดเฉพาะเมื่อความสูงมีหน้าที่ · ที่เหลือเว้นระยะ
4. Seal accent ใช้น้อย — ไม่ flood สีฟ้า
5. AI อยู่ในกล่องจดหมาย ไม่ใช่ป้ายประกาย
