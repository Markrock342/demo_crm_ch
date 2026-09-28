import { eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./index.js";
import { users } from "./schema/auth.js";
import { customers } from "./schema/crm.js";
import { containers } from "./schema/operations.js";
import { activities, tasks } from "./schema/tasks.js";
import { DEMO_ORG_ID } from "../domain/tenancy.js";
import { bangkokDate } from "./seed-operations.js";

/**
 * Demo to-dos and activity log (formerly bundled in src/crm.ts). Stable ids, dates relative to
 * today (Bangkok). Owners are matched to seeded staff by their Chinese name. Chinese text is kept —
 * the UI localizes sample sentences (src/v2/lib/demoText.ts).
 *
 * Re-running refreshes dates only on rows nobody has touched (updated_at = created_at), so work
 * done in the app survives a re-seed. A due time of 00:00 means "any time that day".
 */

type TaskSpec = {
  id: string;
  title: string;
  days: number;
  time?: string;
  owner: string;
  priority: "high" | "mid" | "low";
  done?: boolean;
  customerId: string;
  box?: string;
};

type ActSpec = {
  id: string;
  type: "call" | "mail" | "meet" | "note" | "task";
  days: number;
  time: string;
  user: string;
  customerId: string;
  body: string;
};

const TASKS: TaskSpec[] = [
  { id: "tk-seed-01", title: "催 TCLU3308812 产地证扫描件", days: 0, time: "16:00", owner: "林晓衡", priority: "high", customerId: "c9", box: "TCLU3308812" },
  { id: "tk-seed-02", title: "回南沙两柜补件邮件", days: -1, time: "16:00", owner: "周可", priority: "high", customerId: "c4" },
  { id: "tk-seed-03", title: "青岛中泰八月对账回执", days: 1, owner: "马思远", priority: "mid", customerId: "c3" },
  { id: "tk-seed-04", title: "北榄胶加柜报价两只 40HC", days: 2, owner: "陈一宁", priority: "mid", customerId: "c10" },
  { id: "tk-seed-05", title: "空箱回运宁波舱位", days: 4, owner: "马思远", priority: "low", customerId: "c8" },
  { id: "tk-seed-06", title: "协会见面纪要归档", days: -3, owner: "周可", priority: "low", done: true, customerId: "c9" },
  { id: "tk-seed-07", title: "催收华运六月运费尾款", days: -3, owner: "诗丽蓬·旺萨功", priority: "high", customerId: "c1" },
  { id: "tk-seed-08", title: "预约南沙到港两柜海关查验", days: 0, time: "10:00", owner: "马思远", priority: "high", customerId: "c4", box: "CSNU6620418" },
  { id: "tk-seed-09", title: "上海东盟对账单寄出", days: -2, owner: "诗丽蓬·旺萨功", priority: "mid", customerId: "c7" },
  { id: "tk-seed-10", title: "罗勇冷冻柜预冷确认", days: 1, time: "09:00", owner: "纳帕·西苏", priority: "high", customerId: "c9" },
  { id: "tk-seed-11", title: "义乌周班舱位锁定", days: 3, owner: "陈一宁", priority: "mid", customerId: "c5" },
  { id: "tk-seed-12", title: "蛇口家具柜安排派送", days: 0, time: "14:00", owner: "纳帕·西苏", priority: "mid", customerId: "c1", box: "ONEU0417736" },
  { id: "tk-seed-13", title: "青岛化工 MSDS 归档", days: 6, owner: "马思远", priority: "low", customerId: "c3" },
  { id: "tk-seed-14", title: "东莞电子旺季报价复核", days: -1, owner: "陈一宁", priority: "mid", customerId: "c6" },
  { id: "tk-seed-15", title: "北榄胶提单确认", days: -2, owner: "陈一宁", priority: "mid", done: true, customerId: "c10", box: "OOLU8844011" },
];

const ACTIVITIES: ActSpec[] = [
  { id: "ac-seed-01", type: "mail", days: 0, time: "09:10", user: "林晓衡", customerId: "c9", body: "罗勇来信：TCLU3308812 产地证未到，问盐田周五班。" },
  { id: "ac-seed-02", type: "call", days: -1, time: "11:20", user: "周可", customerId: "c4", body: "吴南确认两柜产地证下午补扫。" },
  { id: "ac-seed-03", type: "note", days: -1, time: "18:40", user: "陈一宁", customerId: "c10", body: "北榄胶要加两只 40HC，周三截关。" },
  { id: "ac-seed-04", type: "meet", days: -3, time: "14:00", user: "林晓衡", customerId: "c9", body: "春武里协会见面，谈林查班直航盐田。" },
  { id: "ac-seed-05", type: "task", days: -5, time: "09:40", user: "马思远", customerId: "c3", body: "重发八月对账单，账龄 41 天。" },
  { id: "ac-seed-06", type: "note", days: -6, time: "16:00", user: "周可", customerId: "c1", body: "盐田家具加柜超重，改 9 日班。" },
  { id: "ac-seed-07", type: "call", days: 0, time: "10:30", user: "周可", customerId: "c1", body: "华运确认六月尾款本周五安排付款。" },
  { id: "ac-seed-08", type: "mail", days: 0, time: "08:45", user: "马思远", customerId: "c4", body: "南沙两柜到港，海关抽中查验，已约明早。" },
  { id: "ac-seed-09", type: "note", days: -1, time: "15:20", user: "陈一宁", customerId: "c6", body: "东莞电子十月旺季要加 6 柜，报价需复核。" },
  { id: "ac-seed-10", type: "meet", days: -2, time: "10:00", user: "林晓衡", customerId: "c9", body: "罗勇冷冻食品年度合约面谈，意向 16 柜。" },
  { id: "ac-seed-11", type: "task", days: -2, time: "17:05", user: "诗丽蓬·旺萨功", customerId: "c7", body: "上海东盟八月账款部分到账，余款催收中。" },
  { id: "ac-seed-12", type: "mail", days: -1, time: "13:50", user: "纳帕·西苏", customerId: "c1", body: "蛇口家具柜清关放行，安排明天派送。" },
  { id: "ac-seed-13", type: "call", days: -2, time: "11:15", user: "陈一宁", customerId: "c5", body: "义乌确认厦门瓷砖柜已开船，预计五天到曼谷。" },
  { id: "ac-seed-14", type: "note", days: -4, time: "16:30", user: "马思远", customerId: "c8", body: "空箱回运年度协议已签，按月结算。" },
];

function at(days: number, time = "00:00", now = new Date()) {
  return new Date(`${bangkokDate(now, days)}T${time}:00+07:00`);
}

export async function seedTasks(db: Db) {
  const now = new Date();
  const people = await db.select({ id: users.id, nameZh: users.nameZh }).from(users);
  const userByName = new Map(people.filter((p) => p.nameZh).map((p) => [p.nameZh!, p.id]));
  const custRows = await db.select({ id: customers.id }).from(customers).where(eq(customers.organizationId, DEMO_ORG_ID));
  const custIds = new Set(custRows.map((c) => c.id));
  const boxes = TASKS.flatMap((t) => (t.box ? [t.box] : []));
  const boxRows = boxes.length
    ? await db.select({ no: containers.containerNo, jobId: containers.jobId }).from(containers).where(inArray(containers.containerNo, boxes))
    : [];
  const jobByBox = new Map(boxRows.map((b) => [b.no, b.jobId]));
  const admin = userByName.get("林晓衡") ?? null;

  let taskCount = 0;
  for (const t of TASKS) {
    if (!custIds.has(t.customerId)) continue;
    const due = at(t.days, t.time, now);
    const created = at(Math.min(t.days, 0) - 2, "09:00", now);
    await db
      .insert(tasks)
      .values({
        id: t.id,
        organizationId: DEMO_ORG_ID,
        title: t.title,
        dueAt: due,
        priority: t.priority,
        status: t.done ? "done" : "open",
        ownerUserId: userByName.get(t.owner) ?? null,
        customerId: t.customerId,
        jobId: t.box ? (jobByBox.get(t.box) ?? null) : null,
        containerNo: t.box ?? null,
        createdBy: admin,
        completedAt: t.done ? due : null,
        createdAt: created,
        updatedAt: created,
      })
      .onConflictDoUpdate({
        target: tasks.id,
        set: { dueAt: due, completedAt: t.done ? due : null, createdAt: created, updatedAt: created },
        setWhere: sql`${tasks.updatedAt} = ${tasks.createdAt}`,
      });
    taskCount++;
  }

  let actCount = 0;
  for (const a of ACTIVITIES) {
    if (!custIds.has(a.customerId)) continue;
    const when = at(a.days, a.time, now);
    await db
      .insert(activities)
      .values({
        id: a.id,
        organizationId: DEMO_ORG_ID,
        type: a.type,
        body: a.body,
        customerId: a.customerId,
        userId: userByName.get(a.user) ?? null,
        occurredAt: when,
        createdAt: when,
      })
      .onConflictDoUpdate({ target: activities.id, set: { occurredAt: when, createdAt: when } });
    actCount++;
  }
  return { tasks: taskCount, activities: actCount };
}
