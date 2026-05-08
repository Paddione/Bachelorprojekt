// website/src/lib/e2e-marker.ts
//
// Detects whether an inbound HTTP request is a Playwright E2E call so the
// form endpoints (/api/contact, /api/booking, /api/bug-report,
// /api/portal/messages) can stamp `is_test_data=true` on the rows they
// create — the purge function then sweeps them at the next bracket.
//
// Contract (chosen over option B = pattern-match on email/subject because
// option B yields false positives — real users with the substring "test" in
// their email get reaped):
//
//   - Request must carry `X-E2E-Test: 1` (any truthy value).
//   - Request must ALSO carry `X-Cron-Secret` matching `process.env.CRON_SECRET`.
//
// The double check matters: a public-Internet user could send the header by
// hand, but they can't forge the cron secret (it's a SealedSecret, only the
// website pod's env reads it). Without the secret the marker is ignored —
// fail-closed.
//
// CRON_SECRET is the same gate used by /api/admin/systemtest/purge-all-test-data
// and the cleanup-fixtures CronJob, so propagating it from the Playwright
// runner is already a solved-problem (env var on the runner, then forwarded
// per-request).

export function isE2ETestRequest(request: Request): boolean {
  const e2e = request.headers.get('X-E2E-Test');
  if (!e2e) return false;
  const provided = request.headers.get('X-Cron-Secret');
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  // Constant-time-ish compare. Length mismatch short-circuits (which leaks
  // length, but the secret is high-entropy so that's fine in this attack
  // surface).
  if (!provided || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
