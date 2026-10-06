# Engineering conventions for agents (read fully)

Repo: /Volumes/Extreme SSD/Dev/code/demo_crm_ch — React/Vite front-end (src/), Hono API (server/, entry server/app.ts, routes in server/routes/*), Drizzle + LOCAL Postgres (.env DATABASE_URL, localhost). Dev servers normally running: web :5173, API :8787 (tsx watch). If they're down, start `npm run dev` in the background and say so. Don't commit/push; don't touch git. Don't deploy.

The app is production-only (no demo/"shell" mode): everything goes through the real API + DB. Ignore dead `shell ?` branches.

## Other agents work in parallel — file ownership is strict
Each agent owns the files named in its prompt. Shared files you may touch minimally (re-read right before each edit, small additive edits, never reformat): `server/app.ts` (mount one line), `server/db/schema/index.ts` (one export line), `server/domain/rbac.ts` (append codes/roles), `package.json` (deps only via `npm install <pkg>`; add your test file to the `test` script with a one-line edit), `src/AppRoutes.tsx` (lazy route line), `src/pages/Settings.tsx` (one import + one render line + nav entry).
Migrations: ONLY your assigned number, e.g. `server/db/migrations/0020_cases.sql`. Write the file completely in one write before running `npm run db:migrate` (others run migrate too). Idempotent SQL (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). Seeds idempotent (upsert by stable id), dates relative to today, called from server/db/seed.ts with one line.
Never edit another agent's files; describe needed changes in your final report.

## Conventions
- Server: existing patterns — `tenantGate`/`requireAuth`/`requireTenant`, `requirePermission(...)` (codes in server/domain/rbac.ts), organizationId scoping on every query, audit via server/services/audit.service.ts (`writeAudit` with organizationId), validation like neighbouring routes (400 with field errors, 404 for foreign ids). Tests in server/services/*.test.ts (node:test via tsx), added to `npm test`.
- Client: API functions in src/api/*.ts, react-query hooks in src/v2/hooks/*, permissions via src/v2/hooks/useCan.ts. Lists are server-paged (see src/api/lists.ts, server/services/*-list.service.ts). UI kit + style rules: /private/tmp/claude-501/-Volumes-Extreme-SSD-Dev-code-demo-crm-ch/e2812d2a-2868-4ece-b696-fc37babe04cb/scratchpad/VISUAL_BRIEF.md.
- i18n: `tx(key, vars?)` from `useStore()`. New strings in your own `src/i18n-pages/<area>.ts` (`export default { zh, th, en }`, your key prefix), all 3 languages, per /private/tmp/claude-501/-Volumes-Extreme-SSD-Dev-code-demo-crm-ch/e2812d2a-2868-4ece-b696-fc37babe04cb/scratchpad/i18n/GLOSSARY.md. Thai primary. Page translations load per language (vite plugin) — follow the pattern of existing src/i18n-pages files exactly.
- Secrets via env only (document in .env.example).

## Verify
`npx tsc -b` (fix your files), `npm test`, and exercise your feature in Chrome: playwright `chromium.launch({ channel: "chrome" })`, open http://127.0.0.1:5173/login and click a test-account button `.pub-test-btn` (nth 0 admin, 1 sales, 2 ops, 3 cs, 4 finance; marketing may be appended later). The onboarding tour does not auto-start under automation. Screenshot at 1440 and 390, read the PNGs, fix issues. Clean up temp scripts (in the scratchpad, never the repo root) and any test data.

## Final report (short)
What works end-to-end, files changed, migration applied, tests, env vars, anything not done, requests for other owners.
