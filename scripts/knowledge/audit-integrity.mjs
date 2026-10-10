#!/usr/bin/env node
// scripts/knowledge/audit-integrity.mjs — Read-only SDLC & Knowledge Integrity Audit (T901697)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const { Pool } = pg;

export async function runAudit({ queryFn, repoRoot = process.cwd() }) {
  const result = {
    constraints_and_indexes: { status: 'ok', issues: [] },
    collections: [],
    model_lineage: { models: {}, missing_model_chunks: 0 },
    source_freshness: { current: 0, changed: 0, missing: 0, unverifiable: 0 },
    phase_events: { order_violations: 0, gaps: 0, tickets_inspected: 0 },
    github_coverage: { status: 'unpopulated', rows: 0 },
    open_resolutions: 0,
    graph_status: { status: 'unknown', freshness: 'unknown', coverage: 'unknown' },
  };

  // 1. Constraints / Indexes
  const constraints = await queryFn(`
    SELECT conname, pg_get_constraintdef(c.oid) as def
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname IN ('knowledge', 'tickets') AND c.contype = 'c';
  `);
  for (const r of constraints.rows) {
    if (r.conname === 'collections_source_check' && !r.def.includes('code_graph')) {
      result.constraints_and_indexes.issues.push(`collections_source_check lacks 'code_graph': ${r.def}`);
    }
  }
  if (result.constraints_and_indexes.issues.length > 0) {
    result.constraints_and_indexes.status = 'warning';
  }

  // 2. Collection counts vs actual chunk counts
  const colRows = await queryFn(`
    SELECT c.id, c.name, c.source, c.chunk_count, c.last_indexed_at,
           COUNT(ch.id)::int as actual_chunk_count
    FROM knowledge.collections c
    LEFT JOIN knowledge.chunks ch ON ch.collection_id = c.id
    GROUP BY c.id, c.name, c.source, c.chunk_count, c.last_indexed_at
    ORDER BY c.name;
  `);
  for (const c of colRows.rows) {
    const isHistorical = /openspec/i.test(c.name) || /openspec/i.test(c.source);
    result.collections.push({
      id: c.id,
      name: c.name,
      source: c.source,
      recorded_chunk_count: c.chunk_count,
      actual_chunk_count: c.actual_chunk_count,
      discrepancy: c.chunk_count !== c.actual_chunk_count,
      last_indexed_at: c.last_indexed_at,
      historical: isHistorical,
    });
  }

  // 3. Model lineage
  const modelRows = await queryFn(`
    SELECT COALESCE(c.metadata->>'embedding_model', 'unknown') as model,
           COUNT(*)::int as count
    FROM knowledge.chunks c
    GROUP BY COALESCE(c.metadata->>'embedding_model', 'unknown');
  `);
  for (const m of modelRows.rows) {
    result.model_lineage.models[m.model] = m.count;
    if (m.model === 'unknown') {
      result.model_lineage.missing_model_chunks += m.count;
    }
  }

  // 4. Source freshness (file: URIs)
  const docRows = await queryFn(`
    SELECT d.source_uri, d.sha256
    FROM knowledge.documents d
    WHERE d.source_uri LIKE 'file:%';
  `);
  for (const d of docRows.rows) {
    const rel = d.source_uri.slice(5).replace(/^\/+/, '');
    const full = path.resolve(repoRoot, rel);
    // Boundary check: prevent escaping repoRoot
    if (!full.startsWith(path.resolve(repoRoot))) {
      result.source_freshness.unverifiable++;
      continue;
    }
    if (!fs.existsSync(full)) {
      result.source_freshness.missing++;
      continue;
    }
    try {
      const content = fs.readFileSync(full, 'utf8');
      const hash = createHash('sha256').update(content).digest('hex');
      if (hash === d.sha256) {
        result.source_freshness.current++;
      } else {
        result.source_freshness.changed++;
      }
    } catch {
      result.source_freshness.unverifiable++;
    }
  }

  // 5. Phase events & order checking
  const eventRows = await queryFn(`
    SELECT e.ticket_id, e.id, e.phase, e.state, e.at, COALESCE(e.detail, '') as detail
    FROM tickets.factory_phase_events e
    WHERE NOT (e.phase IN ('scout', 'design', 'plan') AND e.detail = 'auto: stage-plan')
    ORDER BY e.ticket_id, e.at ASC, e.id ASC;
  `);
  const byTicket = new Map();
  for (const ev of eventRows.rows) {
    if (!byTicket.has(ev.ticket_id)) byTicket.set(ev.ticket_id, []);
    byTicket.get(ev.ticket_id).push(ev);
  }
  result.phase_events.tickets_inspected = byTicket.size;
  for (const [, events] of byTicket) {
    let hasPlan = false, hasImpl = false, hasVerify = false, orderError = false;
    for (const ev of events) {
      if (ev.phase === 'plan' && ev.state === 'done' && !hasPlan) {
        hasPlan = true;
      } else if (ev.phase === 'implement' && ev.state === 'entered' && !hasImpl) {
        hasImpl = true;
        if (!hasPlan) orderError = true;
      } else if (ev.phase === 'verify' && ev.state === 'done' && !hasVerify) {
        hasVerify = true;
        if (!hasImpl) orderError = true;
      }
    }
    if (orderError) result.phase_events.order_violations++;
    if (!hasPlan || !hasImpl || !hasVerify) result.phase_events.gaps++;
  }

  // 6. GitHub tables check
  try {
    const ghRes = await queryFn(`
      SELECT count(*)::int as count
      FROM information_schema.tables
      WHERE table_schema = 'tickets' AND table_name LIKE 'github_%';
    `);
    const ghRowCount = await queryFn(`
      SELECT (
        (SELECT count(*) FROM tickets.github_objects) +
        (SELECT count(*) FROM tickets.github_snapshots)
      )::int as total
    `).catch(() => ({ rows: [{ total: 0 }] }));

    const total = ghRowCount.rows[0]?.total ?? 0;
    result.github_coverage.rows = total;
    result.github_coverage.status = total > 0 ? 'populated' : 'unpopulated';
  } catch {
    result.github_coverage.status = 'unknown';
  }

  // 7. Missing resolutions on closed tickets
  try {
    const resCheck = await queryFn(`
      SELECT count(*)::int as count
      FROM tickets.tickets
      WHERE status = 'done' AND resolution IS NULL;
    `);
    result.open_resolutions = resCheck.rows[0]?.count ?? 0;
  } catch {
    result.open_resolutions = 0;
  }

  // 8. Code Graph Status
  const cacheRoot = process.env.DEVFLOW_CACHE_DIR || path.join(process.env.HOME || '', '.cache', 'devflow-mcp');
  let graphStatus = { status: 'unknown', freshness: 'unknown', coverage: 'unknown' };
  try {
    let foundMeta = null;
    if (fs.existsSync(cacheRoot)) {
      const dirs = fs.readdirSync(cacheRoot, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => path.join(cacheRoot, d.name));
      for (const d of dirs) {
        try {
          const meta = JSON.parse(fs.readFileSync(path.join(d, 'meta.json'), 'utf8'));
          if (path.resolve(meta.repo) === path.resolve(repoRoot)) {
            foundMeta = meta;
            break;
          }
        } catch {}
      }
    }
    if (foundMeta) {
      let head = null;
      try {
        head = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      } catch {}
      const stale = foundMeta.commit && head ? foundMeta.commit !== head : 'unknown';
      const freshness = stale === true ? 'stale' : (stale === false ? 'fresh' : 'unknown');
      const coverage = (foundMeta.partial || (foundMeta.parse_errors && foundMeta.parse_errors > 0))
        ? 'degraded'
        : ((foundMeta.pending ?? 0) > 0 ? 'partial' : 'complete');
      graphStatus = {
        status: 'ok',
        project: foundMeta.project,
        count: foundMeta.count,
        commit: foundMeta.commit,
        head,
        freshness,
        coverage,
      };
    }
  } catch {
    graphStatus = { status: 'unknown', freshness: 'unknown', coverage: 'unknown' };
  }
  result.graph_status = graphStatus;

  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pgurl = process.env.PGURL || process.env.TRACKING_DB_URL;
  if (!pgurl) {
    console.error('ERROR: PGURL or TRACKING_DB_URL required');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: pgurl });
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const out = await runAudit({
      queryFn: (sql) => client.query(sql),
      repoRoot: process.env.REPO_ROOT || process.cwd(),
    });
    console.log(JSON.stringify(out, null, 2));
    await client.query('ROLLBACK');
    process.exit(0);
  } catch (err) {
    console.error('Audit failed:', err);
    try { await client.query('ROLLBACK'); } catch {}
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}
