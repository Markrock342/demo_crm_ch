# LCS Phase B — Closeout (Closed)

> อัปเดต: 4 กันยายน 2569 — **Closed (shell)**  
> SoT: `LCS_LogisticsOS_PLAN.md` · Phase A: [lcs-phase-a.md](./lcs-phase-a.md)

## สถานะ

**Closed** บน client shell · persist `*-v4`  
มติ: portal = เลือกลูกค้า (+ PIN `demo`) · สถานะตู้ = §5 เป็นหลัก + map เก่าครั้งเดียว

## ส่งมอบ

| โมดูล | รายละเอียด |
|--------|------------|
| Tracking | `ShellBoxStatus` §5 · flags · statusHistory · Boxes/Yard/JobDetail/Exceptions |
| Vendors | `/vendors` master · bill/cost ผูก `vendorId` |
| Rates | buy/sell/carrier/validFrom · Create quotation from rate |
| Notifications | `notificationStore` · `/notifications` · กระดิ่ง shell |
| Portal | `/portal` · home/jobs/docs/invoices · Account preview |

## DoD

1. Ops: ตู้ §5 + flags → Exceptions + Notifications  
2. Finance: Vendors → bills → Rates → Quote จาก rate  
3. Customer: Portal (ลูกค้า±PIN) → jobs/docs/invoices  

## Deferred (ยังไม่ปิดดี)

| รายการ | เหตุผล |
|--------|--------|
| API / PG / Vercel | shell only |
| Push / อีเมลแจ้งเตือน | Phase C |
| External tracking API | Phase C |
| อัปโหลดไฟล์ใน portal | รอ storage |
| AP payment เต็ม | นอกสcope B |
| LCL/Air/Truck | ล็อก FCL |
| Portal auth production | PIN จำลองเท่านั้น |

## ไฟล์หลัก

`ops.port.ts` · `opsStore` · `supportStore` · `notificationStore` · `portalSession` · `Vendors` · `Notifications` · `Portal` · `seedLcs` · `App`/`nav`/`main`
