#!/usr/bin/env node
/**
 * k6-style load test in plain Node (no deps): N virtual users sign in, then loop over the
 * main read screens with realistic think time, like people clicking around the CRM.
 *
 *   LOADTEST_PASSWORD=... node scripts/loadtest.mjs                 # 100 users · 60 s · http://127.0.0.1:8787
 *   node scripts/loadtest.mjs --users 100 --duration 120 --think 1000-4000 --base http://127.0.0.1:8787
 *
 * Signs in as LOADTEST_EMAIL (default loadtest@scale.local — create it with scripts/scale-data.ts).
 * Prints p50 / p95 / p99 latency and errors per endpoint. Exit code 1 when the error rate > 1 %.
 */

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};

const BASE = opt("base", process.env.LOADTEST_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const USERS = Number(opt("users", 100));
const DURATION_S = Number(opt("duration", 60));
const RAMP_S = Number(opt("ramp", 10));
const [THINK_MIN, THINK_MAX] = opt("think", "1000-3000").split("-").map(Number);
const EMAIL = process.env.LOADTEST_EMAIL || "loadtest@scale.local";
const PASSWORD = process.env.LOADTEST_PASSWORD;
if (!PASSWORD) {
  console.error("Set LOADTEST_PASSWORD (see scripts/scale-data.ts).");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const think = () => sleep(THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** endpoint name -> latencies (ms) */
const stats = new Map();
const errors = new Map();
function record(name, ms, ok, detail) {
  if (!stats.has(name)) stats.set(name, []);
  stats.get(name).push(ms);
  if (!ok) {
    const e = errors.get(name) ?? { count: 0, sample: "" };
    e.count += 1;
    e.sample ||= detail;
    errors.set(name, e);
  }
}

async function hit(vu, name, path) {
  const t0 = performance.now();
  try {
    const res = await fetch(BASE + path, { headers: { cookie: vu.cookie, "accept-encoding": "gzip, br" } });
    const body = await res.text();
    record(name, performance.now() - t0, res.ok, `${res.status} ${body.slice(0, 80)}`);
    return res.ok ? JSON.parse(body) : null;
  } catch (e) {
    record(name, performance.now() - t0, false, String(e?.message ?? e));
    return null;
  }
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  const cookie = (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie")]).map((c) => c.split(";")[0]).join("; ");
  return { cookie, jobIds: [], customerIds: [], invoiceIds: [] };
}

/** One "screen" = what the SPA fetches when a person opens that page. */
const SCREENS = [
  [3, "home", async (vu) => {
    await Promise.all([
      hit(vu, "GET /auth/me", "/api/auth/me"),
      hit(vu, "GET /notifications/unread-count", "/api/notifications/unread-count"),
      hit(vu, "GET /tasks", "/api/tasks?mine=1"),
      hit(vu, "GET /finance/ar-summary", "/api/finance/ar-summary"),
    ]);
  }],
  [4, "jobs board", async (vu) => {
    const d = await hit(vu, "GET /jobs (board)", "/api/jobs?view=board&perStage=20");
    if (d?.items?.length) vu.jobIds = d.items.map((j) => j.id);
  }],
  [3, "jobs list+search", async (vu) => {
    const q = pick(["", "", "LT-00", "COSCO", "THLCH", "Test Customer 01"]);
    const offset = pick([0, 0, 0, 50, 100]);
    const d = await hit(vu, "GET /jobs (list)", `/api/jobs?limit=50&offset=${offset}&q=${encodeURIComponent(q)}&status=${pick(["", "IN_PROGRESS", "CLOSED", "delayed"])}`);
    if (d?.items?.length) vu.jobIds = d.items.map((j) => j.id);
  }],
  [4, "job detail", async (vu) => {
    const id = vu.jobIds.length ? pick(vu.jobIds) : null;
    if (!id) return;
    await Promise.all([
      hit(vu, "GET /jobs/:id", `/api/jobs/${id}`),
      hit(vu, "GET /jobs/:id/milestones", `/api/jobs/${id}/milestones`),
      hit(vu, "GET /jobs/:id/financials", `/api/jobs/${id}/financials`),
      hit(vu, "GET /jobs/:id/tasks", `/api/jobs/${id}/tasks`),
    ]);
  }],
  [3, "customers", async (vu) => {
    const q = pick(["", "", "Test Customer 1", "ลูกค้า"]);
    const d = await hit(vu, "GET /customers", `/api/customers?limit=50&q=${encodeURIComponent(q)}`);
    if (d?.items?.length) vu.customerIds = d.items.map((c) => c.id);
  }],
  [2, "customer detail", async (vu) => {
    const id = vu.customerIds.length ? pick(vu.customerIds) : null;
    if (!id) return;
    await Promise.all([
      hit(vu, "GET /customers/:id", `/api/customers/${id}`),
      hit(vu, "GET /jobs?customerId", `/api/jobs?customerId=${id}&limit=50`),
      hit(vu, "GET /invoices?customerId", `/api/invoices?customerId=${id}&limit=50`),
    ]);
  }],
  [3, "invoices", async (vu) => {
    const d = await hit(vu, "GET /invoices", `/api/invoices?limit=50&view=${pick(["", "open", "overdue", "paid"])}`);
    if (d?.items?.length) vu.invoiceIds = d.items.map((i) => i.id);
  }],
  [2, "containers", async (vu) => {
    await hit(vu, "GET /containers", `/api/containers?limit=100&status=${pick(["", "yard", "hold"])}`);
  }],
];
const WEIGHTED = SCREENS.flatMap(([w, name, fn]) => Array(w).fill({ name, fn }));

async function runVu(i, endAt) {
  await sleep((RAMP_S * 1000 * i) / USERS);
  let vu;
  try {
    const t0 = performance.now();
    vu = await login();
    record("POST /auth/login", performance.now() - t0, true);
  } catch (e) {
    record("POST /auth/login", 0, false, String(e.message));
    return;
  }
  // Everybody lands on the jobs list first so detail screens have ids.
  await SCREENS[1][2](vu);
  while (Date.now() < endAt) {
    await think();
    if (Date.now() >= endAt) break;
    await pick(WEIGHTED).fn(vu);
  }
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function main() {
  console.log(`load test: ${USERS} users, ${DURATION_S}s (+${RAMP_S}s ramp), think ${THINK_MIN}-${THINK_MAX} ms → ${BASE}`);
  const endAt = Date.now() + (RAMP_S + DURATION_S) * 1000;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: USERS }, (_, i) => runVu(i, endAt)));
  const secs = (Date.now() - t0) / 1000;

  const rows = [];
  let all = [];
  let errTotal = 0;
  for (const [name, arr] of stats) {
    const s = [...arr].sort((a, b) => a - b);
    all = all.concat(s);
    const e = errors.get(name)?.count ?? 0;
    errTotal += e;
    rows.push({ endpoint: name, n: s.length, p50: pct(s, 50), p95: pct(s, 95), p99: pct(s, 99), max: s.at(-1) ?? 0, errors: e });
  }
  rows.sort((a, b) => b.p95 - a.p95);
  all.sort((a, b) => a - b);
  const f = (v) => v.toFixed(0).padStart(6);
  console.log(`\n${"endpoint".padEnd(34)} ${"n".padStart(6)} ${"p50".padStart(6)} ${"p95".padStart(6)} ${"p99".padStart(6)} ${"max".padStart(6)}  err`);
  for (const r of rows) console.log(`${r.endpoint.padEnd(34)} ${String(r.n).padStart(6)} ${f(r.p50)} ${f(r.p95)} ${f(r.p99)} ${f(r.max)}  ${r.errors}`);
  console.log(
    `\nALL: ${all.length} requests in ${secs.toFixed(0)} s (${(all.length / secs).toFixed(1)} req/s) · p50 ${pct(all, 50).toFixed(0)} ms · p95 ${pct(all, 95).toFixed(0)} ms · p99 ${pct(all, 99).toFixed(0)} ms · errors ${errTotal} (${((errTotal / Math.max(1, all.length)) * 100).toFixed(2)} %)`,
  );
  for (const [name, e] of errors) console.log(`  ! ${name}: ${e.count}× e.g. ${e.sample}`);
  if (process.argv.includes("--json")) console.log(JSON.stringify({ rows, total: all.length, errors: errTotal }));
  process.exit(errTotal / Math.max(1, all.length) > 0.01 ? 1 : 0);
}

main();
