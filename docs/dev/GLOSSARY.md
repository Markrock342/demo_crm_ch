# CANGZHAN CRM — translation glossary & style (authoritative)

Product: CRM + operations system for a China–Thailand/ASEAN freight/terminal business. Users: Thai and Chinese staff; external customers in the portal. All UI strings (zh/th/en) must read naturally and consistently.

## Style
- **Thai (th)**: natural modern business Thai. Concise UI wording. No ครับ/ค่ะ in UI. Don't transliterate English when a normal Thai word exists. Keep trade terms Thai staff use in English: Booking, B/L, ETD, ETA, TEU, CBM, Job, HS code, Incoterms, POL/POD only in dense table headers (else ท่าต้นทาง/ท่าปลายทาง), SLA. Arabic numerals.
- **Chinese (zh)**: Simplified, mainland 货代 usage, concise, full-width punctuation in sentences.
- **English (en)**: plain, concise, sentence case. No developer jargon.
- Buttons = verb first. Empty states = what's missing + what to do next. Errors = what happened + how to fix.
- No dev jargon to users (shell, API, stub, V2…). Keep `{placeholder}` tokens exactly. No emoji.

## Terms (zh / th / en)
| concept | zh | th | en |
|---|---|---|---|
| job (shipment job) | 工作单 | งานขนส่ง | Job |
| task / to-do | 任务 | สิ่งที่ต้องทำ | Task |
| needs attention | 待处理 | งานที่ต้องจัดการ | Needs attention |
| case / ticket (CS) | 工单 | เคส | Case |
| SLA | 服务时限 | SLA (เวลาที่ต้องตอบ) | SLA |
| canned reply | 快捷回复 | ข้อความตอบกลับสำเร็จรูป | Canned reply |
| marketing | 市场部 | ฝ่ายการตลาด | Marketing |
| customer service | 客服部 | ฝ่ายบริการลูกค้า | Customer service |
| module | 模块 | โมดูล | Module |
| segment | 客户分组 | กลุ่มลูกค้า | Segment |
| funnel / conversion | 转化漏斗 / 转化率 | กรวยการขาย / อัตราการเปลี่ยน | Funnel / Conversion |
| lead source | 线索来源 | แหล่งที่มาของลูกค้าเป้าหมาย | Lead source |
| overview | 总览 | ภาพรวม | Overview |
| quotation | 报价单 | ใบเสนอราคา | Quotation |
| customer / lead / contact | 客户 / 潜在客户 / 联系人 | ลูกค้า / ลูกค้าเป้าหมาย / ผู้ติดต่อ | Customer / Lead / Contact |
| pipeline | 销售漏斗 | ไปป์ไลน์การขาย | Pipeline |
| owner / assignee | 负责人 | ผู้รับผิดชอบ | Owner |
| rate | 运价 | อัตราค่าขนส่ง | Rate |
| lane | 航线 | เส้นทาง | Lane |
| container / container no. | 集装箱 / 箱号 | ตู้คอนเทนเนอร์ / เลขตู้ | Container / Container no. |
| booking | 订舱 | Booking | Booking |
| vessel / voyage / carrier | 船名 / 航次 / 船公司 | เรือ / เที่ยวเรือ / สายเรือ | Vessel / Voyage / Carrier |
| cut-off | 截关 | Cut-off | Cut-off |
| yard | 堆场 | ลานตู้ | Yard |
| free time / last free day | 免费用箱期 / 最后免费日 | วันฟรี / วันฟรีสุดท้าย | Free time / Last free day |
| milestone | 里程碑 | ขั้นตอนงาน | Milestones |
| document / template | 单证 / 模板 | เอกสาร / แม่แบบ | Document / Template |
| inbox | 收件箱 | กล่องจดหมาย | Inbox |
| notification | 通知 | การแจ้งเตือน | Notification |
| invoice / billing note / receipt | 发票 / 对账单 / 收据 | ใบแจ้งหนี้ / ใบวางบิล / ใบเสร็จรับเงิน | Invoice / Billing note / Receipt |
| vendor / vendor bill | 供应商 / 供应商账单 | ซัพพลายเออร์ / บิลซัพพลายเออร์ | Vendor / Vendor bill |
| overdue / due date | 逾期 / 到期日 | เกินกำหนด / วันครบกำหนด | Overdue / Due date |
| report / settings | 报表 / 设置 | รายงาน / ตั้งค่า | Report / Settings |
| customer portal | 客户门户 | พอร์ทัลลูกค้า | Customer portal |
| AI summary | AI 摘要 | สรุปด้วย AI | AI summary |
| save/cancel/delete/edit/create/search/filter/export | 保存/取消/删除/编辑/新建/搜索/筛选/导出 | บันทึก/ยกเลิก/ลบ/แก้ไข/สร้าง/ค้นหา/ตัวกรอง/ส่งออก | Save/Cancel/Delete/Edit/Create/Search/Filter/Export |
