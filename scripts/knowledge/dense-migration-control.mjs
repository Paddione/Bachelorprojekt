// scripts/knowledge/dense-migration-control.mjs
//
// Additive Shadow-Migration BGE(1024) -> Gemma(768): Statusschema, Writer-Gate
// per DB-Trigger, Shadow-DDL, Coverage-Pruefung, atomarer Swap/Rollback.
// Mutationen nur ueber explizite Kommandos gegen explizites PGURL; Run-IDs
// und Tabellen-Identifier werden validiert, nie aus Roh-Input gebaut.

import { createHash } from 'node:crypto';
import { DENSE_DIMENSIONS, DENSE_MODEL, DENSE_PROFILE } from '../lib/dense-embedding.mjs';

export const MIGRATION_TABLE = 'public.dense_embedding_migrations';
export const RUN_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export const SHADOW_RUN_RE = /^[a-z0-9_]{1,48}$/;
export const SOURCE_PROFILE = 'bge-m3:1024:Q8_0:v1';
const KNOWN_INCOMING_FKS = new Set(['coaching.drafts', 'coaching.snippets']);

export function assertRunId(runId) {
  if (typeof runId !== 'string' || !RUN_RE.test(runId)) {
    throw new Error(`invalid --run-id '${runId}' (expected ${RUN_RE})`);
  }
  return runId;
}

function assertShadowRun(runId) {
  if (!SHADOW_RUN_RE.test(runId)) {
    throw new Error(`run id '${runId}' is not identifier-safe (use [a-z0-9_], max 48)`);
  }
}

export function shadowName(kind, runId) {
  assertShadowRun(runId);
  return kind === 'knowledge' ? `knowledge.chunks_gemma_${runId}` : `public.code_embeddings_gemma_${runId}`;
}

export function backupName(kind, runId) {
  assertShadowRun(runId);
  return kind === 'knowledge' ? `knowledge.chunks_bge_backup_${runId}` : `public.code_embeddings_bge_backup_${runId}`;
}

export async function ensureControlTable(db) {
  await db.query(
    `CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
       run_id TEXT PRIMARY KEY,
       source_profile TEXT NOT NULL,
       target_profile TEXT NOT NULL,
       phase TEXT NOT NULL DEFAULT 'prepared',
       writer_locked BOOLEAN NOT NULL DEFAULT true,
       active BOOLEAN NOT NULL DEFAULT false,
       source_fingerprint TEXT,
       counters JSONB NOT NULL DEFAULT '{}',
       manifest JSONB NOT NULL DEFAULT '{}',
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS dense_migrations_one_active ON ${MIGRATION_TABLE} (active) WHERE active = true`,
  );
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS dense_migrations_one_lock ON ${MIGRATION_TABLE} (writer_locked) WHERE writer_locked = true`,
  );
}

export async function getGeneration(db, runId) {
  const r = await db.query(`SELECT * FROM ${MIGRATION_TABLE} WHERE run_id = $1`, [runId]);
  return r.rows[0] ?? null;
}

export async function getActiveGeneration(db) {
  const r = await db.query(`SELECT * FROM ${MIGRATION_TABLE} WHERE active = true LIMIT 1`);
  return r.rows[0] ?? null;
}

/** Bestandsaufnahme: Tabellen, Spaltentypen, Collections, eingehende FKs. */
export async function preflightInventory(db) {
  const inv = { tables: {}, columns: {}, collections: [], incomingFKs: [] };
  for (const t of ['knowledge.chunks', 'knowledge.collections', 'knowledge.documents', 'code_embeddings', 'tickets.ticket_embeddings']) {
    const r = await db.query(`SELECT to_regclass($1) AS oid`, [t]);
    inv.tables[t] = r.rows[0]?.oid ?? null;
  }
  for (const [t, c] of [['knowledge.chunks', 'embedding'], ['code_embeddings', 'embedding'], ['tickets.ticket_embeddings', 'embedding']]) {
    if (!inv.tables[t]) { inv.columns[`${t}.${c}`] = 'missing-table'; continue; }
    const r = await db.query(
      `SELECT format_type(atttypid, atttypmod) AS t FROM pg_attribute WHERE attrelid = $1::regclass AND attname = $2`,
      [t, c],
    );
    inv.columns[`${t}.${c}`] = r.rows[0]?.t ?? 'missing-column';
  }
  if (inv.tables['knowledge.collections']) {
    const r = await db.query(
      `SELECT id, name, source, embedding_model, chunk_count FROM knowledge.collections ORDER BY name`,
    );
    inv.collections = r.rows;
  }
  for (const t of ['knowledge.chunks', 'code_embeddings']) {
    if (!inv.tables[t]) continue;
    const r = await db.query(
      `SELECT conname, conrelid::regclass::text AS referencing_table, pg_get_constraintdef(oid) AS definition
         FROM pg_constraint WHERE contype = 'f' AND confrelid = $1::regclass`,
      [t],
    );
    for (const row of r.rows) inv.incomingFKs.push({ target: t, ...row });
  }
  return inv;
}

export function unknownIncomingFKs(inv) {
  return inv.incomingFKs.filter((fk) => !KNOWN_INCOMING_FKS.has(fk.referencing_table));
}

async function hashOrdered(db, sql) {
  const h = createHash('sha256');
  let count = 0;
  const r = await db.query(sql);
  for (const row of r.rows) {
    h.update(String(row.id)); h.update('\0'); h.update(row.text ?? ''); h.update('\0');
    count++;
  }
  return { count, fingerprint: h.digest('hex') };
}

/** Quell-Snapshot mit Fingerprints; fehlende Tabellen explizit melden. */
export async function snapshotSource(db) {
  if (!((await db.query(`SELECT to_regclass('knowledge.chunks') AS o`)).rows[0]?.o)) {
    throw new Error('snapshotSource: knowledge.chunks fehlt');
  }
  if (!((await db.query(`SELECT to_regclass('code_embeddings') AS o`)).rows[0]?.o)) {
    throw new Error('snapshotSource: code_embeddings fehlt');
  }
  const knowledge = await hashOrdered(db, `SELECT id, text FROM knowledge.chunks ORDER BY id`);
  const code = await hashOrdered(db, `SELECT id, content AS text FROM code_embeddings ORDER BY id`);
  let tickets = { count: 0, fingerprint: 'no-table' };
  if ((await db.query(`SELECT to_regclass('tickets.ticket_embeddings') AS o`)).rows[0]?.o) {
    const r = await db.query(`SELECT count(*)::int AS n FROM tickets.ticket_embeddings`);
    tickets = { count: r.rows[0].n, fingerprint: `count:${r.rows[0].n}` };
  }
  return { knowledge, code, tickets };
}

async function copyGrants(db, fromTable, toTable) {
  const r = await db.query(
    `SELECT grantee, privilege_type, is_grantable FROM information_schema.role_table_grants
      WHERE table_schema || '.' || table_name = $1`,
    [fromTable],
  );
  const seen = new Set();
  for (const g of r.rows) {
    const key = `${g.grantee}:${g.privilege_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await db.query(`GRANT ${g.privilege_type} ON ${toTable} TO "${g.grantee}"${g.is_grantable === 'YES' ? ' WITH GRANT OPTION' : ''}`);
  }
}

const GUARD_FN_SQL = `
CREATE OR REPLACE FUNCTION public.dense_migration_guard() RETURNS trigger AS $$
DECLARE want text := TG_ARGV[0];
DECLARE have text := current_setting('dense_migration.run', true);
BEGIN
  IF have IS DISTINCT FROM want THEN
    RAISE EXCEPTION 'dense writes locked (migration %, bypass: SET dense_migration.run)', want;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$ LANGUAGE plpgsql`;

const GATED_TABLES = [
  'knowledge.chunks', 'knowledge.documents', 'knowledge.collections',
  'code_embeddings', 'tickets.ticket_embeddings',
];

export async function enableWriterGate(db, runId) {
  await db.query(GUARD_FN_SQL);
  for (const t of GATED_TABLES) {
    try {
      await db.query(
        `CREATE TRIGGER dense_migration_gate BEFORE INSERT OR UPDATE OR DELETE ON ${t}
         FOR EACH ROW EXECUTE FUNCTION public.dense_migration_guard('${runId}')`,
      );
    } catch (err) {
      if (!/already exists/.test(err?.message ?? '')) throw err;
    }
  }
}

export async function disableWriterGate(db, runId) {
  for (const t of GATED_TABLES) {
    await db.query(`DROP TRIGGER IF EXISTS dense_migration_gate ON ${t}`);
  }
  void runId;
}

/** prepare: Inventar, Snapshot, Shadow-DDL, Lock + Trigger. Kein Reindex. */
export async function prepare(db, runId) {
  assertRunId(runId);
  assertShadowRun(runId);
  await ensureControlTable(db);
  if (await getGeneration(db, runId)) throw new Error(`prepare: run '${runId}' existiert bereits`);
  if (await getActiveGeneration(db)) throw new Error('prepare: bereits eine aktive Generation vorhanden');
  const locked = await db.query(`SELECT run_id FROM ${MIGRATION_TABLE} WHERE writer_locked = true LIMIT 1`);
  if (locked.rows.length > 0) throw new Error(`prepare: writer lock von run '${locked.rows[0].run_id}' aktiv`);

  const inv = await preflightInventory(db);
  if (!inv.tables['knowledge.chunks'] || !inv.tables['code_embeddings']) {
    throw new Error('prepare: knowledge.chunks oder code_embeddings fehlt');
  }
  const unknown = unknownIncomingFKs(inv);
  if (unknown.length > 0) {
    throw new Error(`prepare: unbekannte eingehende FKs: ${unknown.map((f) => `${f.referencing_table}.${f.conname}`).join(', ')}`);
  }
  const snap = await snapshotSource(db);
  const kShadow = shadowName('knowledge', runId);
  const cShadow = shadowName('code', runId);

  await db.query(
    `CREATE TABLE ${kShadow} (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       document_id UUID NOT NULL REFERENCES knowledge.documents(id) ON DELETE CASCADE,
       collection_id UUID NOT NULL REFERENCES knowledge.collections(id) ON DELETE CASCADE,
       position INT NOT NULL,
       text TEXT NOT NULL,
       embedding vector(${DENSE_DIMENSIONS}) NOT NULL,
       metadata JSONB NOT NULL DEFAULT '{}',
       source_chunk_id UUID NOT NULL,
       part_index INT NOT NULL DEFAULT 0,
       source_hash TEXT NOT NULL,
       profile TEXT NOT NULL DEFAULT '${DENSE_PROFILE}',
       UNIQUE (source_chunk_id, part_index)
     )`,
  );
  await db.query(`CREATE INDEX ${kShadow.replace('.', '_')}_doc_idx ON ${kShadow} (document_id)`);
  await db.query(`CREATE INDEX ${kShadow.replace('.', '_')}_col_idx ON ${kShadow} (collection_id)`);
  await copyGrants(db, 'knowledge.chunks', kShadow);

  await db.query(
    `CREATE TABLE ${cShadow} (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       file_path TEXT NOT NULL,
       chunk_index INT NOT NULL,
       content TEXT NOT NULL,
       file_hash TEXT NOT NULL,
       embedding vector(${DENSE_DIMENSIONS}) NOT NULL,
       metadata JSONB NOT NULL DEFAULT '{}',
       source_row_id UUID NOT NULL,
       source_chunk_index INT NOT NULL,
       part_index INT NOT NULL DEFAULT 0,
       profile TEXT NOT NULL DEFAULT '${DENSE_PROFILE}',
       UNIQUE (file_path, chunk_index)
     )`,
  );
  await db.query(`CREATE INDEX ${cShadow.replace('.', '_')}_path_idx ON ${cShadow} (file_path)`);
  await copyGrants(db, 'code_embeddings', cShadow);

  const fingerprint = `k:${snap.knowledge.fingerprint}|c:${snap.code.fingerprint}|t:${snap.tickets.fingerprint}`;
  await db.query(
    `INSERT INTO ${MIGRATION_TABLE}
       (run_id, source_profile, target_profile, phase, writer_locked, active, source_fingerprint, counters, manifest)
     VALUES ($1, $2, $3, 'prepared', true, false, $4, $5, $6)`,
    [runId, SOURCE_PROFILE, DENSE_PROFILE, fingerprint,
      { knowledge_done: 0, knowledge_total: snap.knowledge.count, code_done: 0, code_total: snap.code.count, errors: 0 },
      { knowledge_shadow: kShadow, code_shadow: cShadow, snapshot: snap,
        collections: inv.collections.map((c) => ({ id: c.id, name: c.name, model: c.embedding_model })) }],
  );
  await enableWriterGate(db, runId);
  return { runId, kShadow, cShadow, snapshot: snap, fingerprint };
}

export async function setPhase(db, runId, phase, counters) {
  const sets = [`phase = $2`, `updated_at = now()`];
  const params = [runId, phase];
  if (counters) { sets.push(`counters = $3`); params.push(counters); }
  await db.query(`UPDATE ${MIGRATION_TABLE} SET ${sets.join(', ')} WHERE run_id = $1`, params);
}

/** verify: Coverage, Rekonstruktion, Vektoren, Profil, Fingerprint; HNSW+ANALYZE. */
export async function verify(db, runId) {
  assertRunId(runId);
  const gen = await getGeneration(db, runId);
  if (!gen) throw new Error(`verify: run '${runId}' unbekannt`);
  if (!['prepared', 'indexing', 'verifying', 'verified'].includes(gen.phase)) {
    throw new Error(`verify: unerwartete Phase '${gen.phase}'`);
  }
  await setPhase(db, runId, 'verifying');
  const kShadow = shadowName('knowledge', runId);
  const cShadow = shadowName('code', runId);
  const problems = [];

  const snap = await snapshotSource(db);
  const fp = `k:${snap.knowledge.fingerprint}|c:${snap.code.fingerprint}|t:${snap.tickets.fingerprint}`;
  if (fp !== gen.source_fingerprint) problems.push('source drift: fingerprint differs from prepare snapshot');

  for (const [label, srcSql, shadow, idCol] of [
    ['knowledge', `SELECT id, text FROM knowledge.chunks ORDER BY id`, kShadow, 'source_chunk_id'],
    ['code', `SELECT id, content AS text FROM code_embeddings ORDER BY id`, cShadow, 'source_row_id'],
  ]) {
    const src = await db.query(srcSql);
    const sh = await db.query(`SELECT ${idCol} AS sid, part_index, text, embedding, profile FROM ${shadow} ORDER BY ${idCol}, part_index`);
    const bySrc = new Map();
    for (const row of sh.rows) {
      const k = String(row.sid);
      if (!bySrc.has(k)) bySrc.set(k, []);
      bySrc.get(k).push(row);
    }
    const srcIds = new Set(src.rows.map((r) => String(r.id)));
    const unknown = [...bySrc.keys()].filter((id) => !srcIds.has(String(id)));
    if (unknown.length > 0) problems.push(`${label}: ${unknown.length} unbekannte Source-IDs`);
    for (const s of src.rows) {
      const parts = bySrc.get(String(s.id));
      if (!parts || parts.length === 0) { problems.push(`${label}: source ${s.id} ohne Teilchunk`); continue; }
      if (parts.map((p) => p.text).join('') !== s.text) problems.push(`${label}: source ${s.id} rekonstruiert nicht exakt`);
      for (const p of parts) {
        if (p.profile !== DENSE_PROFILE) problems.push(`${label}: source ${s.id} Fremdprofil`);
        if (p.embedding == null) problems.push(`${label}: source ${s.id} Null-Vektor`);
      }
    }
    const bad = await db.query(
      `SELECT count(*)::int AS n FROM ${shadow} WHERE embedding IS NULL OR vector_dims(embedding) != ${DENSE_DIMENSIONS}`,
    );
    if (bad.rows[0].n > 0) problems.push(`${label}: ${bad.rows[0].n} Zeilen mit falscher Dimension/Null`);
  }

  if (problems.length > 0) {
    // Coverage-/Rekonstruktionsfehler: zurueck auf indexing, Reindex darf fortsetzen.
    // Quelldrift dagegen macht den Run ungueltig (failed, frisches prepare noetig).
    const drifted = problems.some((p) => p.startsWith('source drift'));
    await setPhase(db, runId, drifted ? 'failed' : 'indexing');
    throw new Error(`verify fehlgeschlagen:\n- ${problems.slice(0, 20).join('\n- ')}${problems.length > 20 ? `\n- ... +${problems.length - 20} weitere` : ''}`);
  }

  await db.query(`CREATE INDEX IF NOT EXISTS ${kShadow.replace('.', '_')}_hnsw ON ${kShadow} USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)`);
  await db.query(`CREATE INDEX IF NOT EXISTS ${cShadow.replace('.', '_')}_hnsw ON ${cShadow} USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)`);
  await db.query(`ANALYZE ${kShadow}`);
  await db.query(`ANALYZE ${cShadow}`);
  const manifest = { ...(gen.manifest ?? {}), verified_snapshot: snap };
  await db.query(`UPDATE ${MIGRATION_TABLE} SET manifest = $2, updated_at = now() WHERE run_id = $1`, [runId, manifest]);
  await setPhase(db, runId, 'verified');
  return { runId, snapshot: snap };
}

/** Geplante Aenderungen ohne Mutation (dry-run) bzw. als Claim pruefen. */
export async function cutoverPlan(db, runId) {
  assertRunId(runId);
  const gen = await getGeneration(db, runId);
  if (!gen) throw new Error(`cutover: run '${runId}' unbekannt`);
  if (gen.phase !== 'verified') throw new Error(`cutover: run '${runId}' ist '${gen.phase}', erwartet 'verified'`);
  const unknown = unknownIncomingFKs(await preflightInventory(db));
  if (unknown.length > 0) {
    throw new Error(`cutover abgebrochen: unbekannte eingehende FKs: ${unknown.map((f) => f.referencing_table).join(', ')}`);
  }
  return {
    runId,
    rename: [
      ['knowledge.chunks', backupName('knowledge', runId)],
      [shadowName('knowledge', runId), 'knowledge.chunks'],
      ['code_embeddings', backupName('code', runId)],
      [shadowName('code', runId), 'code_embeddings'],
    ],
    collections: 'alle bge-m3-Collections -> embeddinggemma-300m + recount',
    caches: 'coaching.questionnaire_insights_cache leeren; Devflow-Cache (Root-Repo) separat',
  };
}

/** Atomarer Swap in einer Transaktion mit Advisory- und Tabellen-Sperren. */
export async function cutover(db, runId) {
  assertRunId(runId);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('dense-migration-cutover'))`);
    await client.query(
      `LOCK TABLE knowledge.chunks, knowledge.documents, knowledge.collections, code_embeddings,
                  ${shadowName('knowledge', runId)}, ${shadowName('code', runId)} IN ACCESS EXCLUSIVE MODE`,
    );
    await client.query(`SET LOCAL dense_migration.run = '${runId}'`);
    const plan = await cutoverPlan(client, runId);
    const gen = await getGeneration(client, runId);
    const snap = await snapshotSource(client);
    const fp = `k:${snap.knowledge.fingerprint}|c:${snap.code.fingerprint}|t:${snap.tickets.fingerprint}`;
    if (fp !== gen.source_fingerprint) throw new Error('cutover abgebrochen: source drift seit prepare');
    if (snap.knowledge.count === 0 && snap.code.count === 0) throw new Error('cutover abgebrochen: leere Quelle');

    const fkDefs = [];
    for (const t of ['knowledge.chunks', 'code_embeddings']) {
      const r = await client.query(
        `SELECT conname, conrelid::regclass::text AS referencing_table, pg_get_constraintdef(oid) AS definition
           FROM pg_constraint WHERE contype = 'f' AND confrelid = $1::regclass`,
        [t],
      );
      for (const row of r.rows) {
        fkDefs.push(row);
        await client.query(`ALTER TABLE ${row.referencing_table} DROP CONSTRAINT "${row.conname}"`);
      }
    }
    for (const [from, to] of plan.rename) {
      await client.query(`ALTER TABLE ${from} RENAME TO ${to.split('.').pop()}`);
    }
    for (const fk of fkDefs) {
      // Definition unveraendert: nach dem Swap zeigen die Namen bereits auf die neuen kanonischen Tabellen.
      await client.query(`ALTER TABLE ${fk.referencing_table} ADD CONSTRAINT "${fk.conname}" ${fk.definition}`);
    }
    const ticketRes = await migrateTicketTable(client);
    const preCols = await client.query(
      `SELECT id FROM knowledge.collections WHERE embedding_model = 'bge-m3'`,
    );
    const updatedCollections = preCols.rows.map((r) => r.id);
    await client.query(
      `UPDATE knowledge.collections SET embedding_model = $1, chunk_count = sub.cnt, last_indexed_at = now()
         FROM (SELECT collection_id AS id, COUNT(*)::int AS cnt FROM knowledge.chunks GROUP BY collection_id) AS sub
        WHERE knowledge.collections.id = sub.id AND knowledge.collections.embedding_model = 'bge-m3'`,
      [DENSE_MODEL],
    );
    await client.query(`DELETE FROM coaching.questionnaire_insights_cache`);
    await client.query(`UPDATE ${MIGRATION_TABLE} SET active = false WHERE active = true AND run_id != $1`, [runId]);
    await client.query(
      `UPDATE ${MIGRATION_TABLE} SET phase = 'active', active = true, writer_locked = true,
              manifest = manifest || $2, updated_at = now() WHERE run_id = $1`,
      [runId, { cutover_snapshot: snap, ticket_table: ticketRes, updated_collections: updatedCollections }],
    );
    await client.query('COMMIT');
    return { runId, snapshot: snap, ticket_table: ticketRes };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Rueckfall vor Writer-Freigabe: Swap zurueck, Labels zurueck, Trigger weg.
 * Nach neuen Writes (Fingerprint-Drift) verweigert: kein Datenverlust als
 * Rollback verkaufen — dann ist ein expliziter Rueckwaerts-Reindex noetig.
 */
export async function rollback(db, runId) {
  assertRunId(runId);
  const gen = await getGeneration(db, runId);
  if (!gen) throw new Error(`rollback: run '${runId}' unbekannt`);
  if (!gen.writer_locked) {
    const snap = await snapshotSource(db);
    const fp = `k:${snap.knowledge.fingerprint}|c:${snap.code.fingerprint}|t:${snap.tickets.fingerprint}`;
    const post = gen.manifest?.cutover_snapshot;
    const postFp = post ? `k:${post.knowledge.fingerprint}|c:${post.code.fingerprint}|t:${post.tickets.fingerprint}` : null;
    if (postFp && fp !== postFp) {
      throw new Error('rollback verweigert: neue Writes seit Freigabe — expliziter Rueckwaerts-Reindex noetig');
    }
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('dense-migration-cutover'))`);
    await client.query(`SET LOCAL dense_migration.run = '${runId}'`);
    const kShadow = shadowName('knowledge', runId);
    const cShadow = shadowName('code', runId);
    const kBackup = backupName('knowledge', runId);
    const cBackup = backupName('code', runId);
    const fkDefs = [];
    for (const t of ['knowledge.chunks', 'code_embeddings']) {
      const r = await client.query(
        `SELECT conname, conrelid::regclass::text AS referencing_table, pg_get_constraintdef(oid) AS definition
           FROM pg_constraint WHERE contype = 'f' AND confrelid = $1::regclass`,
        [t],
      );
      for (const row of r.rows) {
        fkDefs.push({ ...row, target: t });
        await client.query(`ALTER TABLE ${row.referencing_table} DROP CONSTRAINT "${row.conname}"`);
      }
    }
    for (const [from, to] of [
      ['knowledge.chunks', kShadow.split('.').pop()],
      [kBackup, 'chunks'],
      ['code_embeddings', cShadow.split('.').pop()],
      [cBackup, 'code_embeddings'],
    ]) {
      await client.query(`ALTER TABLE ${from} RENAME TO ${to}`);
    }
    for (const fk of fkDefs) {
      // Ruecktausch: Namen zeigen nach dem Rename wieder auf die Originaltabellen.
      await client.query(`ALTER TABLE ${fk.referencing_table} ADD CONSTRAINT "${fk.conname}" ${fk.definition}`);
    }
    const updated = gen.manifest?.updated_collections ?? [];
    if (updated.length > 0) {
      await client.query(
        `UPDATE knowledge.collections SET embedding_model = 'bge-m3' WHERE id = ANY($1::uuid[])`,
        [updated],
      );
    }
    await client.query(
      `UPDATE ${MIGRATION_TABLE} SET phase = 'failed', active = false, writer_locked = false,
              manifest = manifest || $2, updated_at = now() WHERE run_id = $1`,
      [runId, { rollback_at: new Date().toISOString() }],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await disableWriterGate(db, runId);
  return { runId, rolled_back: true };
}
export async function migrateTicketTable(db) {
  const exists = (await db.query(`SELECT to_regclass('tickets.ticket_embeddings') AS o`)).rows[0]?.o;
  if (!exists) return { skipped: 'no-table' };
  const n = (await db.query(`SELECT count(*)::int AS n FROM tickets.ticket_embeddings`)).rows[0].n;
  if (n > 0) throw new Error(`tickets.ticket_embeddings enthaelt ${n} Zeilen — separater Reindex noetig, kein stiller Cast`);
  await db.query(`ALTER TABLE tickets.ticket_embeddings ALTER COLUMN embedding TYPE vector(${DENSE_DIMENSIONS})`);
  await db.query(
    `CREATE OR REPLACE FUNCTION tickets.fn_find_similar(query_embedding vector(${DENSE_DIMENSIONS}), limit_count INTEGER DEFAULT 5)
     RETURNS TABLE(ticket_id UUID, external_id TEXT, chunk TEXT, chunk_type TEXT, similarity DOUBLE PRECISION) AS $$
     BEGIN RETURN QUERY
       SELECT te.ticket_id, t.external_id, te.chunk, te.chunk_type,
              (1 - (te.embedding <=> query_embedding))::DOUBLE PRECISION AS similarity
         FROM tickets.ticket_embeddings te JOIN tickets.tickets t ON t.id = te.ticket_id
        ORDER BY te.embedding <=> query_embedding LIMIT limit_count;
     END $$ LANGUAGE plpgsql STABLE`,
  );
  return { migrated: 'empty-table-to-768' };
}
