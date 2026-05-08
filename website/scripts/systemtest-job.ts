// website/scripts/systemtest-job.ts
//
// Standalone CLI entrypoint for the system-test cleanup CronJobs. Two modes:
//
//   - cleanup-fixtures: hourly sweep of test fixtures + expired magic tokens
//   - drain-outbox:     5-minute drain of the failure-bridge outbox + reconcile
//
// The CronJobs (k3d/cronjob-systemtest-cleanup.yaml) actually invoke the HTTP
// endpoints `/api/admin/systemtest/cleanup-fixtures` and `/drain-outbox` via
// curl — that pattern matches the existing billing CronJobs (cronjob-monthly-
// billing.yaml, cronjob-dunning-detection.yaml) and avoids needing a separate
// container image with tsx/ts-node + the website's node_modules.
//
// This script remains useful for:
//   - local invocation (`npx tsx website/scripts/systemtest-job.ts drain-outbox`)
//     while debugging, with WEBSITE_DATABASE_URL pointing at a port-forwarded
//     shared-db.
//   - manual one-shot runs from inside a website pod via `kubectl exec` if a
//     CronJob ever needs to be skipped + re-run.

import { pool } from '../src/lib/website-db';
import {
  purgeFixturesFor,
  drainOutbox,
  purgeExpiredMagicTokens,
} from '../src/lib/systemtest/cleanup';
import { runReconciler } from '../src/lib/systemtest/reconciler';

const mode = process.argv[2];

(async () => {
  try {
    if (mode === 'cleanup-fixtures') {
      const fixtures = await purgeFixturesFor(pool, { graceHours: 24 });
      const tokens = await purgeExpiredMagicTokens(pool);
      console.log(JSON.stringify({ mode, ...fixtures, magicTokens: tokens.purged }));
    } else if (mode === 'drain-outbox') {
      const out = await drainOutbox(pool);
      const recon = await runReconciler(pool);
      console.log(JSON.stringify({ mode, outbox: out, reconciler: recon }));
    } else {
      console.error(`unknown mode: ${mode ?? '(none)'}`);
      console.error('usage: systemtest-job.ts <cleanup-fixtures|drain-outbox>');
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
})().catch((e) => {
  console.error(`[systemtest-job] failed: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
  process.exit(1);
});
