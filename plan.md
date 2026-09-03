# สรุปงาน CANGZHAN / demo_crm_ch

> อัปเดต: 3 กันยายน 2569 (Client full shell)  
> Repo: `demo_crm_ch` · Deploy: `democrmch.vercel.app`

---

## ภาพรวม

โปรเจกต์ CRM โลจิสติกส์จีน–ไทย (货代) — Vite + React + Hono + PostgreSQL  
รอบนี้: **เต็มรูปแบบบน client** (densify UI → Logistics → Quote→Job→Bill → โมดูลรอง) ด้วย shell + ports/stub + localStorage — **ยังไม่ต่อ API/DB**

ดูแผนที่: [`docs/index.md`](docs/index.md) · **Handoff:** [`docs/handoff-client-shell.md`](docs/handoff-client-shell.md) · [`docs/client-full-shell.md`](docs/client-full-shell.md) · P0: [`docs/basics-ui-p0.md`](docs/basics-ui-p0.md)

---

## สถานะรอบนี้

| รายการ | สถานะ |
|---|---|
| UI density (ledger-house compact) | ✅ |
| แผนก Ops + เมนู logistics ตามมติ | ✅ |
| Boxes ↔ Shipments ↔ Yard shell + seed + localStorage | ✅ |
| Quote หลายรายการ + รับ/ปฏิเสธ · Job · Billing จาก job | ✅ |
| Rates / Tasks / Docs checklist / Vendor bills stub | ✅ |
| Docs | ✅ |
| Stub → API จริง | ⏳ ภายหลัง |
| Inbox / Reports เต็ม | ⏸ นอกสcope |
| Vercel `DATABASE_URL` | ⏳ รอ ops |

---

## แผนก (shell)

Sales · **Ops** · Finance · Admin  
Ops home = Yard · Sales เห็น Boxes/Shipments อ่านอย่างเดียว · Yard เฉพาะ Ops+Admin

---

## นอกสcope

LCL/บก/บิน · เชื่อม API จริง · Vercel DB · Inbox/Reports เต็ม · architecture replan · รีแบรนด์ UI

---

## Design Principles (จาก `.impeccable.md`)

1. ภาษาจีนมาก่อน · ไทย/EN สวิตช์  
2. ตัวเลข TEU/ตู้ — tabular-nums  
3. การ์ดเฉพาะเมื่อจำเป็น · densify chrome  
4. Seal accent ใช้น้อย  
5. AI อยู่ในกล่องจดหมาย
