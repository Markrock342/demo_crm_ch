# LCS Phase C — Integrations + automation (Closed)

> อัปเดต: 4 กันยายน 2569 — **Closed (shell + local API bridge)**  
> SoT: `LCS_LogisticsOS_PLAN.md` · Phase B: [lcs-phase-b.md](./lcs-phase-b.md)

## สถานะ

**Closed** · มติ: C0 local API+DB · Email sandbox · Tracking mock · C3a only · อนุญาตแตะ `server/**` / `src/api/**`

## ส่งมอบ

| รหัส | รายละเอียด |
|------|------------|
| C0 | JobPort API adapter · Jobs/Login live · health production local · thin JobDetail |
| C1 | SandboxMailTransport · confirm-to-send · inbound webhook · paste Inbox |
| C2 | TrackingPort + mock · Refresh Boxes/JobDetail · etaChanged/LFD |
| C4 | Extract confirm-apply · AI Job summary · AI management report (fallback ถ้าไม่มี Gemini) |
| C3a | AP pay (shell + `POST /vendor-bills/:id/pay`) · AR aging Overview · accounting CSV |
| C5 | automationStore ≥3 rules · audit · `/automation` Admin |

## DoD

1. Email: paste → AI → draft → confirm ส่ง sandbox  
2. Tracking: mock refresh → ตู้ + flags  
3. C3a: AP pay + AR aging + CSV  
4. AI: Job summary + management report  
5. Automation: ≥3 rules + audit + ปิดได้  
6. docs Closed + Deferred  

## Deferred

| รายการ | เหตุผล |
|--------|--------|
| SMTP/Gmail จริง | รอ credential · path พร้อม (`EMAIL_TRANSPORT`) |
| Carrier tracking key | mock contract ก่อน |
| C3b ERP | นอกสcope |
| Vercel `DATABASE_URL` | local C0 ผ่านแล้ว — รอ ops |
| LCL/Air/Truck | ล็อก FCL |
| Portal OAuth · Push/LINE · auto-send | นอกสcope |
| Job Detail 360 ครบบน API | C0 = list + thin detail |

## ไฟล์หลัก

`adapters/api/job.adapter.ts` · `mail/transport.ts` · `tracking.port` · `routes/tracking.ts` · `automationStore` · `Automation.tsx` · `Jobs`/`Login`/`Inbox`/`Boxes`/`Overview`/`VendorBills`/`Reports`
