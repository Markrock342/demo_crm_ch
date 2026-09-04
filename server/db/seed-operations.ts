import { sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { containers, jobMilestones, jobs } from "../db/schema/operations.js";
import { DEFAULT_MILESTONES } from "../services/milestone.service.js";
import { DEMO_ORG_ID } from "../domain/tenancy.js";

const DEMO_CONTAINERS = [
  { containerNo: "MSCU4829103", customerId: "c1", jobId: "s3", type: "40HC", dir: "out", status: "sail", yardCode: "盐田三期", bl: "SHZ25090281", teu: 2, vessel: "MSC LONDON", pol: "CNYTN", pod: "THLCH", seal: "ML-CN882901", commodity: "家具" },
  { containerNo: "COSU7193348", customerId: "c4", jobId: "s1", type: "20GP", dir: "out", status: "hold", yardCode: "南沙一期", bl: "NSA25082911", teu: 1, vessel: "COSCO SHIPPING ARIES", pol: "CNNSA", pod: "THLCH", seal: "CS-771902", commodity: "机械配件" },
  { containerNo: "OOLU2611084", customerId: "c2", type: "40HC", dir: "in", status: "yard", yardCode: "林查班 B4", bl: "NGB25081844", teu: 2, pol: "CNNGB", pod: "THLCH", commodity: "塑料粒" },
  { containerNo: "EMCU9037712", customerId: "c5", jobId: "s5", type: "40HC", dir: "out", status: "sail", yardCode: "义乌监管仓", bl: "YIW25090102", teu: 2, vessel: "CMA CGM THALASSA", pol: "CNNGB", pod: "THBKK", commodity: "小商品" },
  { containerNo: "TEMU5541209", customerId: "c3", jobId: "s6", type: "20GP", dir: "in", status: "hold", yardCode: "林查班 C1", bl: "TAO25080177", teu: 1, vessel: "PIL BANGKOK", pol: "CNTAO", pod: "THLCH", commodity: "化工" },
  { containerNo: "CMAU3382106", customerId: "c6", type: "40HC", dir: "out", status: "clear", yardCode: "虎门驳运", bl: "DGN25082209", teu: 2, pol: "CNHMN", pod: "THRYG", commodity: "电子" },
  { containerNo: "TCLU8820145", customerId: "c8", type: "40HC", dir: "in", status: "empty", yardCode: "林查班空箱区", bl: "LCB25083001", teu: 2, pol: "THLCH", pod: "THLCH" },
  { containerNo: "FCIU1479033", customerId: "c7", type: "20GP", dir: "in", status: "yard", yardCode: "林查班 D2", bl: "SHA25081560", teu: 1, pol: "CNSHA", pod: "THLCH", commodity: "棉纱" },
  { containerNo: "GESU6108821", customerId: "c1", jobId: "s3", type: "40HC", dir: "out", status: "yard", yardCode: "盐田堆存", bl: "SHZ25090281", teu: 2, vessel: "MSC LONDON", pol: "CNYTN", pod: "THLCH", seal: "ML-CN882902", commodity: "家具" },
  { containerNo: "HLXU2299017", customerId: "c4", jobId: "s1", type: "40HC", dir: "out", status: "hold", yardCode: "南沙待补", bl: "NSA25083022", teu: 2, vessel: "COSCO SHIPPING ARIES", pol: "CNNSA", pod: "THLCH", seal: "CS-771903", commodity: "机械配件" },
  { containerNo: "MSCU9012284", customerId: "c5", jobId: "s5", type: "20GP", dir: "out", status: "sail", yardCode: "义乌拼箱", bl: "YIW25082755", teu: 1, vessel: "CMA CGM THALASSA", pol: "CNNGB", pod: "THBKK", commodity: "小商品" },
  { containerNo: "COSU4410876", customerId: "c2", type: "40HC", dir: "in", status: "clear", yardCode: "北榄仓", bl: "NGB25080103", teu: 2, pol: "CNNGB", pod: "THBKK", commodity: "塑料粒" },
  { containerNo: "TCLU3308812", customerId: "c9", jobId: "s2", type: "40HC", dir: "out", status: "hold", yardCode: "林查班 A2", bl: "LCB25090201", teu: 2, vessel: "ONE COMMITMENT", pol: "THLCH", pod: "CNYTN", seal: "ONE-330881", commodity: "冷冻食品" },
  { containerNo: "MSCU2201198", customerId: "c9", jobId: "s2", type: "40HC", dir: "out", status: "sail", yardCode: "林查班码头", bl: "LCB25082844", teu: 2, vessel: "ONE COMMITMENT", pol: "THLCH", pod: "CNYTN", commodity: "冷冻食品" },
  { containerNo: "OOLU8844011", customerId: "c10", type: "20GP", dir: "out", status: "yard", yardCode: "林查班 B1", bl: "LCB25090155", teu: 1, pol: "THLCH", pod: "CNNGB", commodity: "树胶" },
] as const;

const DEMO_JOBS = [
  { id: "s1", jobNumber: "JOB-2026-000001", customerId: "c4", origin: "Nansha", destination: "Laem Chabang", pol: "CNNSA", pod: "THLCH", mode: "SEA_FCL", status: "GATE_IN", teu: 3 },
  { id: "s2", jobNumber: "JOB-2026-000002", customerId: "c9", origin: "Laem Chabang", destination: "Yantian", pol: "THLCH", pod: "CNYTN", mode: "SEA_FCL", status: "SAIL", teu: 4 },
  { id: "s3", jobNumber: "JOB-2026-000003", customerId: "c1", origin: "Yantian", destination: "Laem Chabang", pol: "CNYTN", pod: "THLCH", mode: "SEA_FCL", status: "SAIL", teu: 4 },
  { id: "s5", jobNumber: "JOB-2026-000004", customerId: "c5", origin: "Ningbo", destination: "Bangkok", pol: "CNNGB", pod: "THBKK", mode: "SEA_FCL", status: "BOOKING", teu: 3 },
  { id: "s6", jobNumber: "JOB-2026-000005", customerId: "c3", origin: "Qingdao", destination: "Laem Chabang", pol: "CNTAO", pod: "THLCH", mode: "SEA_FCL", status: "GATE_IN", teu: 1 },
] as const;

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export async function seedOperations(db: Db) {
  const [{ count: containerCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(containers);
  if (containerCount > 0) return { skipped: true };

  for (const j of DEMO_JOBS) {
    await db.insert(jobs).values({
      id: j.id,
      organizationId: DEMO_ORG_ID,
      jobNumber: j.jobNumber,
      customerId: j.customerId,
      origin: j.origin,
      destination: j.destination,
      pol: j.pol,
      pod: j.pod,
      mode: j.mode,
      status: j.status,
      teu: j.teu,
      containerCount: Math.ceil(j.teu / 2),
      containerType: "40HC",
    });
  }

  for (const c of DEMO_CONTAINERS) {
    await db.insert(containers).values({
      id: `ctr-${c.containerNo}`,
      organizationId: DEMO_ORG_ID,
      customerId: c.customerId,
      jobId: "jobId" in c ? (c as { jobId: string }).jobId : null,
      containerNo: c.containerNo,
      type: c.type,
      status: c.status,
      direction: c.dir,
      bl: c.bl,
      yardCode: c.yardCode,
      teu: c.teu,
      pol: c.pol ?? null,
      pod: c.pod ?? null,
      vessel: "vessel" in c ? c.vessel : null,
      seal: "seal" in c ? c.seal : null,
      commodity: "commodity" in c ? c.commodity : null,
    });
  }

  const now = new Date();
  for (const j of DEMO_JOBS) {
    for (const m of DEFAULT_MILESTONES) {
      const plannedAt = addDays(now, m.daysFromNow);
      const actualAt = m.daysFromNow < -1 ? addDays(now, m.daysFromNow + 1) : null;
      await db.insert(jobMilestones).values({
        id: `ms-${j.id}-${m.code}`,
        jobId: j.id,
        code: m.code,
        label: m.label,
        sortOrder: m.sortOrder,
        plannedAt,
        actualAt,
      });
    }
  }

  return { skipped: false, containers: DEMO_CONTAINERS.length, jobs: DEMO_JOBS.length };
}
