# LCS Phase A — Job-centric shell (Closed)

> อัปเดต: 4 กันยายน 2569 — **Closed (shell closeout A3)**  
> อ้างอิง: `LCS_LogisticsOS_PLAN.md` · Handoff: [handoff-client-shell.md](./handoff-client-shell.md)

## สถานะ

**Closed** บน client shell ตาม checklist A3-1…A3-9  
API / PostgreSQL / Vercel / storage จริง = **Deferred** (ไม่บล็อกปิด phase)

## สิ่งที่ส่งมอบ (closeout)

| รายการ | รายละเอียด |
|--------|------------|
| Persist | keys `cangzhan-shell-*-v3` |
| Seed §12 | ~15 ลูกค้า · ~30 งาน · ~42 ตู้ · ~20 quotes · ~20 invoices + docs/exceptions |
| Job list | filters customer/route/carrier/owner/ETD·ETA + คอลัมน์ parties/owners/carrier |
| Job Detail | seal / free time / LFD / demurrage · doc note+approval · timeline ขยาย · email placeholder |
| Customer 360 | taxId, billing, credit · active/closed · AR/GP |
| Quotation | validFrom/until · revision · EXPIRED |
| Docs | Missing mode + by-job |
| Billing | due/overdue · VAT/WHT ง่าย · profit by customer/route/sales บน Overview |
| Exceptions | `/exceptions` + Overview ลิงก์ |
| i18n | zh / th / en |

## Checklist A3

- [x] A3-1 Job list filters/columns  
- [x] A3-2 Job Detail seal/LFD/timeline/docs/email note  
- [x] A3-3 Customer master + AR/GP  
- [x] A3-4 Quotation validity/revision/EXPIRED  
- [x] A3-5 Documents Missing center  
- [x] A3-6 Billing due/VAT + profit strips  
- [x] A3-7 `/exceptions` + Overview widgets  
- [x] A3-8 Seed §12  
- [x] A3-9 Docs Closed + Deferred  

## Deferred (ยังไม่ปิดดี — รออนาคต)

| รายการ | เหตุผล |
|--------|--------|
| ต่อ `src/api` / PostgreSQL / Vercel `DATABASE_URL` | ยังไม่เปิดรอบนี้ |
| อัปโหลดไฟล์เอกสารจริง | ต้องการ storage |
| LCL / Air / Truck | ล็อก FCL ทะเลใน UI |
| อีเมลจริง / AI ส่งอัตโนมัติ | Phase C |
| VAT/WHT บัญชีเต็ม | แสดงตัวเลขง่ายแล้วเท่านั้น |
| Roles Documentation/Viewer + audit log | ขยายทีหลัง |
| Phase B/C ทั้งก้อน | รอรอบถัดไป |

## DoD walkthrough

```text
Customer → Quotation → Accept → Job Detail
→ Containers (seal/LFD) → Documents → Cost/GP
→ Invoice (due/VAT) → Payment → Overview + /exceptions
```

หลังอัปเดต seed: ใช้ localStorage keys `*-v3` (หรือล้าง key เก่า) เพื่อโหลดชุดใหม่
