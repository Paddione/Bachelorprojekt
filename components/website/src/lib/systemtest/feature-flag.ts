// website/src/lib/systemtest/feature-flag.ts
//
// Master kill-switch for the system-test failure loop (Task 10).
//
// Off by default. Set SYSTEMTEST_LOOP_ENABLED=true in environments/<env>.yaml
// to enable the seed button on /admin/fragebogen, the rrweb recorder, and the
// /admin/systemtest/board kanban.
//
// Schema bootstrap (tables + columns + view + trigger) ALWAYS runs — it's
// additive and non-breaking. The flag only gates user-facing surfaces.
//
// Cleanup CronJobs run regardless: with the flag off, they have nothing to do
// (zero fixtures created, zero outbox rows). They become no-ops.
//
// API endpoints (/api/admin/systemtest/{seed,board,...}) are admin-auth gated
// and intentionally NOT flag-gated here — the flag governs which UI surfaces
// boot, not which routes exist. That keeps the cron + reconciler paths usable
// during incident response even with the user-facing feature toggled off.

export function isSystemtestLoopEnabled(): boolean {
  return process.env.SYSTEMTEST_LOOP_ENABLED === 'true';
}
