# สรุปงาน CANGZHAN / demo_crm_ch

> อัปเดต: 3 กันยายน 2569 (P0 Basics UI shell เสร็จ)  
> Repo: `demo_crm_ch` · Deploy: `democrmch.vercel.app`

---

## ภาพรวม

โปรเจกต์ CRM โลจิสติกส์จีน–ไทย (货代) — Vite + React + Hono + PostgreSQL  
รอบ P0: **พื้นฐาน UI shell** (Login แผนก → CRM → เสนอราคา → วางบิล) ด้วย `src/shell` + ports/stub — ไม่เปิด/แก้ server, schema, `src/api/*`, Boxes/Yard/Shipments, Vercel

ดูแผนที่สถาปัตยกรรม: [`docs/index.md`](docs/index.md) · รายละเอียด P0: [`docs/basics-ui-p0.md`](docs/basics-ui-p0.md)

---

## สถานะ P0 / รอบถัดไป

| รายการ | สถานะ |
|---|---|
| P0 Login + แผนก + กรองเมนู | ✅ |
| P0 CRM empty walkthrough | ✅ |
| P0 Quote wizard + shell preview | ✅ |
| P0 Billing issue → BN → payment | ✅ |
| P0 docs | ✅ |
| P1 stub remote เต็ม / wire adapters จริง | ⏳ รอบถัดไป |
| P2 logistics UI (Boxes/Yard/Shipments) | ⏸ นอกสcope P0 |
| P3 ข้อ 8 architecture replan | ⏸ |
| Vercel `DATABASE_URL` + migrate/seed prod | ⏳ รอ ops |

---

## สถานะ backlog ก่อนหน้า (ยังถือว่าปิดในโค้ด)

| รายการ | สถานะ |
|---|---|
| Foundation migrate/pool/PgBouncer | ✅ |
| Drop `customers.boxes` | ✅ |
| Vendor Bills from-job + approve | ✅ |
| Mail/docs PG persistence | ✅ |

---

## ยังนอกสcope

- AP payment backend, mail-ops server, เปิดอ่าน API/DB ในรอบ shell
- Logistics pages, Vercel DB setup

---

## Design Principles (จาก `.impeccable.md`)

1. ภาษาจีนมาก่อน · ไทย/EN สวิตช์
2. ตัวเลข TEU/ตู้ — tabular-nums เสมอ
3. การ์ดเฉพาะเมื่อความสูงมีหน้าที่ · ที่เหลือเว้นระยะ
4. Seal accent ใช้น้อย — ไม่ flood สีฟ้า
5. AI อยู่ในกล่องจดหมาย ไม่ใช่ป้ายประกาย
