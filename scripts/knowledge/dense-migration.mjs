#!/usr/bin/env node
// scripts/knowledge/dense-migration.mjs — Operator-CLI der additiven
// 768D-Migration: prepare|reindex|verify|cutover|rollback|status --run-id <id>.
// prepare/cutover/rollback kennen --dry-run. PGURL kommt aus der Umgebung und
// wird nie protokolliert; DENSE_MIGRATION_EMBED_URL zeigt auf das separate
// vorbereitete Gemma-Backend.

import pg from 'pg';
import {
  assertRunId,
  cutover as doCutover,
  cutoverPlan,
  ensureControlTable,
  getActiveGeneration,
  getGeneration,
  prepare as doPrepare,
  rollback as doRollback,
  verify as doVerify,
} from './dense-migration-control.mjs';
import { reindexKnowledge } from './dense-reindex-knowledge.mjs';
import { reindexCode } from './dense-reindex-code.mjs';

const { Pool } = pg;

function usage() {
  process.stdout.write(
    `usage: dense-migration.mjs <prepare|reindex|verify|cutover|rollback|status> --run-id <id> [--dry-run]\n`,
  );
  process.exit(2);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  let runId = null;
  let dryRun = false;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--run-id' && i + 1 < rest.length) runId = rest[++i];
    else if (rest[i] === '--dry-run') dryRun = true;
    else usage();
  }
  if (!['prepare', 'reindex', 'verify', 'cutover', 'rollback', 'status'].includes(command)) usage();
  if (command !== 'status' || runId) assertRunId(runId);
  return { command, runId, dryRun };
}

function makePool() {
  const cs = process.env.PGURL;
  if (!cs) {
    process.stderr.write('PGURL fehlt\n');
    process.exit(3);
  }
  return new Pool({ connectionString: cs });
}

const out = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);

async function main() {
  const { command, runId, dryRun } = parseArgs(process.argv.slice(2));
  const pool = makePool();
  try {
    if (command === 'status') {
      await ensureControlTable(pool);
      if (runId) {
        const gen = await getGeneration(pool, runId);
        if (!gen) throw new Error(`run '${runId}' unbekannt`);
        const { manifest, ...rest } = gen;
        out({ ...rest, manifest_summary: manifestSnapshot(manifest) });
      } else {
        const active = await getActiveGeneration(pool);
        out({ active: active ? pickGen(active) : null });
      }
      return;
    }
    if (command === 'prepare') {
      if (dryRun) {
        out({ runId, dry_run: true, planned: ['inventory', 'snapshot', 'shadow-ddl', 'writer-lock+trigger'] });
        return;
      }
      const res = await doPrepare(pool, runId);
      out({ ok: true, command, fingerprint: res.fingerprint, snapshot: res.snapshot });
      return;
    }
    if (command === 'reindex') {
      const k = await reindexKnowledge({ pool, runId });
      const c = await reindexCode({ pool, runId });
      out({ ok: true, command, runId, knowledge: k, code: c });
      return;
    }
    if (command === 'verify') {
      const res = await doVerify(pool, runId);
      out({ ok: true, command, runId, snapshot: res.snapshot });
      return;
    }
    if (command === 'cutover') {
      if (dryRun) {
        out({ runId, dry_run: true, planned: await cutoverPlan(pool, runId) });
        return;
      }
      const res = await doCutover(pool, runId);
      out({ ok: true, command, runId, snapshot: res.snapshot, ticket_table: res.ticket_table });
      return;
    }
    if (command === 'rollback') {
      if (dryRun) {
        const gen = await getGeneration(pool, runId);
        out({ runId, dry_run: true, phase: gen?.phase ?? 'unknown', planned: 'swap-back + labels + trigger-drop' });
        return;
      }
      const res = await doRollback(pool, runId);
      out({ ok: true, command, ...res });
    }
  } finally {
    await pool.end();
  }
}

function pickGen(g) {
  return { run_id: g.run_id, phase: g.phase, writer_locked: g.writer_locked, active: g.active, counters: g.counters };
}

function manifestSnapshot(m) {
  if (!m) return null;
  const s = m.snapshot;
  return s ? { knowledge: s.knowledge?.count, code: s.code?.count, tickets: s.tickets?.count } : { keys: Object.keys(m) };
}

main().catch((err) => {
  process.stderr.write(`dense-migration: ${err.message}\n`);
  process.exit(1);
});
