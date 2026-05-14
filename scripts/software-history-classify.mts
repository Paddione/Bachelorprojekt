#!/usr/bin/env tsx
import { Pool } from 'pg';
import { classifyPR, CLASSIFIER_VERSION, DEFAULT_MODEL } from '../website/src/lib/software-history-classifier.ts';
import { listUnclassifiedPRs, upsertEventsForPR } from '../website/src/lib/software-history-db.ts';

interface Flags {
  limit?: number;
  dryRun?: boolean;
  retryFailed?: boolean;
}

function parseFlags(argv: string[]): Flags {
  const f: Flags = {};
  for (const a of argv) {
    if (a === '--dry-run')         f.dryRun = true;
    else if (a === '--retry-failed') f.retryFailed = true;
    else if (a.startsWith('--limit=')) f.limit = parseInt(a.slice(8), 10);
  }
  return f;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const connectionString = process.env.TRACKING_DB_URL;
  if (!connectionString) {
    console.error('TRACKING_DB_URL is required (port-forward shared-db or run inside cluster).');
    process.exit(2);
  }
  const pool = new Pool({ connectionString });
  const classifier = `llm:${DEFAULT_MODEL}`;

  try {
    if (flags.retryFailed) {
      const { rowCount } = await pool.query(
        `DELETE FROM bachelorprojekt.software_events WHERE classifier = 'llm:failed'`,
      );
      console.error(`[classify] cleared ${rowCount ?? 0} failed events`);
    }

    const todo = await listUnclassifiedPRs(pool, flags.limit);
    console.error(`[classify] ${todo.length} PRs to classify (version=${CLASSIFIER_VERSION})`);

    let ok = 0, failed = 0, skipped = 0;
    for (let i = 0; i < todo.length; i++) {
      const pr = todo[i];
      try {
        const events = await classifyPR({
          pr_number: pr.pr_number,
          title: pr.title,
          description: pr.description,
        });
        if (flags.dryRun) {
          console.log(JSON.stringify({ pr: pr.pr_number, events }));
          ok++;
          continue;
        }
        const res = await upsertEventsForPR(pool, pr.pr_number, events, classifier, {
          replaceFailed: flags.retryFailed,
        });
        if (res.skipped) skipped++;
        else ok++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[classify] PR #${pr.pr_number} failed: ${msg.slice(0, 200)}`);
        if (!flags.dryRun) {
          await upsertEventsForPR(
            pool,
            pr.pr_number,
            [{ service: 'unknown', area: 'other', kind: 'irrelevant', confidence: 0, notes: msg.slice(0, 200) }],
            'llm:failed',
            { replaceFailed: false },
          ).catch(() => {});
        }
        failed++;
      }
      if ((i + 1) % 20 === 0) console.error(`[classify] progress ${i + 1}/${todo.length}`);
    }
    console.error(`[classify] done. ok=${ok} failed=${failed} skipped=${skipped}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
