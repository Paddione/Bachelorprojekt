// scripts/knowledge/dense-migration.test.mjs — Zustandsmaschine, Coverage und
// Rueckfall mit injizierten Adaptern (kein echtes Postgres, kein Modell).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cutover,
  disableWriterGate,
  enableWriterGate,
  ensureControlTable,
  getGeneration,
  prepare,
  rollback,
  setPhase,
  shadowName,
  verify,
} from './dense-migration-control.mjs';
import { reindexKnowledge } from './dense-reindex-knowledge.mjs';
import { reindexCode } from './dense-reindex-code.mjs';
import { DENSE_PROFILE } from '../lib/dense-embedding.mjs';

const VEC = () => new Array(768).fill(0.1);

function makeFakeFetch({ failAfter = Infinity } = {}) {
  let calls = 0;
  return async (url, opts) => {
    calls++;
    const body = JSON.parse(opts.body);
    if (url.endsWith('/tokenize')) {
      return { ok: true, status: 200, json: async () => ({ tokens: new Array([...body.content].length + 3).fill(1) }), text: async () => '' };
    }
    if (calls > failAfter) return { ok: false, status: 500, text: async () => 'boom' };
    return { ok: true, status: 200, json: async () => ({ data: body.input.map(() => ({ embedding: VEC() })) }), text: async () => '' };
  };
}

// Minimaler In-Memory-Stand: kennt genau die Statements der Module.
function makeFakeDb({ knowledge, code, failOn = null, extraFKs = [] } = {}) {
  const tables = {
    'knowledge.chunks': knowledge ?? [{ id: 'k1', document_id: 'd1', collection_id: 'c1', text: 'Hallo Welt', metadata: {} }],
    'code_embeddings': code ?? [{ id: 'r1', file_path: 'a.ts', chunk_index: 0, content: 'const x = 1;', file_hash: 'h' }],
    'knowledge.collections': [{ id: 'c1', name: 'Specs', source: 'specs_plans', embedding_model: 'bge-m3', chunk_count: 1 }],
    'knowledge.documents': [{ id: 'd1', collection_id: 'c1' }],
    'public.dense_embedding_migrations': [],
    'tickets.ticket_embeddings': [],
  };
  const log = [];
  let txn = null;
  const canonName = (q, bare) => (q.includes('.') ? `${q.split('.')[0]}.${bare}` : `public.${bare}`);
  // to_regclass loest ueber den search_path auf: exakter Treffer, sonst Suffix.
  const resolveKey = (name) => {
    if (tables[name]) return name;
    const bare = name.includes('.') ? name.split('.').pop() : name;
    const hit = Object.keys(tables).find((k) => k === name || k.endsWith(`.${bare}`));
    if (!hit) throw new Error(`fake-db: relation ${name} does not exist`);
    return hit;
  };

  async function query(sql, params = []) {
    log.push(sql);
    if (failOn && sql.includes(failOn)) throw new Error(`injected failure at ${failOn}`);
    const s = sql.replace(/\s+/g, ' ');
    if (/^(BEGIN|COMMIT|ROLLBACK|LOCK TABLE|ANALYZE|SET LOCAL|SELECT pg_advisory)/.test(s)) {
      if (s.startsWith('BEGIN')) txn = JSON.stringify(tables);
      if (s.startsWith('ROLLBACK') && txn) { Object.assign(tables, JSON.parse(txn)); txn = null; }
      if (s.startsWith('COMMIT')) txn = null;
      return { rows: [] };
    }
    if (s.includes('to_regclass')) {
      const lit = s.match(/to_regclass\('([^']+)'\)/);
      const name = params[0] ?? lit?.[1];
      let hit = null;
      try { hit = name ? resolveKey(name) : null; } catch { hit = null; }
      return { rows: hit ? [{ oid: hit, o: hit }] : [{ oid: null, o: null }] };
    }
    if (s.includes('WHERE writer_locked = true')) {
      return { rows: tables['public.dense_embedding_migrations'].filter((r) => r.writer_locked).map((r) => ({ run_id: r.run_id })) };
    }
    if (s.includes("FROM knowledge.collections WHERE embedding_model = 'bge-m3'")) {
      return { rows: tables['knowledge.collections'].filter((c) => c.embedding_model === 'bge-m3') };
    }
    if (s.startsWith('CREATE TABLE')) {
      const name = s.match(/CREATE TABLE (?:IF NOT EXISTS )?(\S+)/)[1];
      if (!(name in tables)) tables[name] = [];
      return { rows: [] };
    }
    if (/CREATE (UNIQUE )?INDEX|GRANT |DROP TRIGGER|CREATE TRIGGER|CREATE OR REPLACE FUNCTION|ALTER TABLE .* TYPE vector/.test(s)) {
      return { rows: [] };
    }
    if (s.includes('FROM information_schema.role_table_grants')) {
      return { rows: [] };
    }
    if (s.includes('FROM public.dense_embedding_migrations WHERE run_id')) {
      return { rows: tables['public.dense_embedding_migrations'].filter((r) => r.run_id === params[0]) };
    }
    if (s.includes('FROM public.dense_embedding_migrations WHERE active = true')) {
      return { rows: tables['public.dense_embedding_migrations'].filter((r) => r.active) };
    }
    if (s.startsWith('INSERT INTO public.dense_embedding_migrations')) {
      tables['public.dense_embedding_migrations'].push({
        run_id: params[0], source_profile: params[1], target_profile: params[2], phase: 'prepared',
        writer_locked: true, active: false, source_fingerprint: params[3], counters: params[4], manifest: params[5],
      });
      return { rows: [] };
    }
    if (s.includes('UPDATE public.dense_embedding_migrations')) {
      const row = tables['public.dense_embedding_migrations'].find((r) => r.run_id === params[0]);
      if (!row) throw new Error('no such generation');
      if (s.includes('SET phase = $2')) row.phase = params[1];
      if (s.includes('counters = $3')) row.counters = params[2];
      if (s.includes('SET manifest = $2') || s.includes('manifest = manifest || $2')) {
        row.manifest = { ...(row.manifest ?? {}), ...params[1] };
      }
      if (s.includes("phase = 'active'")) { row.phase = 'active'; row.active = true; row.writer_locked = true; }
      if (s.includes("phase = 'failed'")) { row.phase = 'failed'; row.active = false; row.writer_locked = false; }
      if (s.includes('SET active = false WHERE active = true')) {
        for (const r of tables['public.dense_embedding_migrations']) if (r.run_id !== params[0]) r.active = false;
      }
      return { rows: [] };
    }
    if (s.includes('format_type(')) {
      const key = params[0].includes('ticket') ? 'tickets.ticket_embeddings' : params[0];
      void key;
      return { rows: [{ t: 'vector(1024)' }] };
    }
    if (s.includes('FROM knowledge.collections ORDER BY name')) return { rows: tables['knowledge.collections'] };
    if (s.includes('confrelid')) {
      const target = params[0];
      const known = target === 'knowledge.chunks'
        ? [{ conname: 'drafts_knowledge_chunk_id_fkey', referencing_table: 'coaching.drafts', definition: 'FOREIGN KEY (knowledge_chunk_id) REFERENCES knowledge.chunks(id) ON DELETE CASCADE' }]
        : [];
      return { rows: [...known, ...extraFKs.filter((f) => f.target === target)] };
    }
    if (s.includes('FROM knowledge.chunks c ORDER')) {
      return { rows: tables[resolveKey('knowledge.chunks')].map((r) => ({ id: r.id, document_id: r.document_id, collection_id: r.collection_id, text: r.text, metadata: r.metadata ?? {} })) };
    }
    if (s.includes('FROM knowledge.chunks ORDER BY id')) {
      return { rows: tables[resolveKey('knowledge.chunks')].map((r) => ({ id: r.id, text: r.text })) };
    }
    if (s.includes('FROM code_embeddings ORDER BY id')) {
      return { rows: tables[resolveKey('code_embeddings')].map((r) => ({ id: r.id, text: r.content })) };
    }
    if (s.includes('SELECT DISTINCT source_chunk_id')) {
      const t = params.length ? null : null; void t;
      const name = s.match(/FROM (\S+)/)[1];
      return { rows: [...new Set((tables[name] ?? []).map((r) => r.source_chunk_id))].map((id) => ({ id })) };
    }
    if (s.includes('SELECT DISTINCT file_path FROM')) {
      const name = s.match(/FROM (\S+)/)[1];
      return { rows: [...new Set((tables[name] ?? []).map((r) => r.file_path))].map((file_path) => ({ file_path })) };
    }
    if (s.includes('SELECT DISTINCT source_row_id')) {
      const name = s.match(/FROM (\S+)/)[1];
      return { rows: [...new Set((tables[name] ?? []).map((r) => r.source_row_id))].map((id) => ({ id })) };
    }
    if (s.includes('FROM code_embeddings WHERE file_path')) {
      return { rows: tables['code_embeddings'].filter((r) => r.file_path === params[0]) };
    }
    if (s.startsWith('INSERT INTO knowledge.chunks_gemma_') || s.startsWith('INSERT INTO public.code_embeddings_gemma_')) {
      const name = s.match(/INSERT INTO (\S+)/)[1];
      const cols = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
      void cols;
      tables[name].push({ _params: params });
      // Knowledge-Shape:
      if (name.includes('chunks_gemma_')) {
        tables[name][tables[name].length - 1] = {
          document_id: params[0], collection_id: params[1], position: params[2], text: params[3],
          embedding: params[4] ? JSON.parse(params[4]) : null, metadata: JSON.parse(params[5]),
          source_chunk_id: params[6], part_index: params[7], source_hash: params[8], profile: params[9],
        };
      } else {
        tables[name][tables[name].length - 1] = {
          file_path: params[0], chunk_index: params[1], content: params[2], file_hash: params[3],
          embedding: params[4] ? JSON.parse(params[4]) : null, metadata: JSON.parse(params[5]),
          source_row_id: params[6], source_chunk_index: params[7], part_index: params[8], profile: params[9],
        };
      }
      return { rows: [] };
    }
    if (s.includes('AS sid, part_index, text, embedding, profile FROM')) {
      const name = s.match(/FROM (\S+)/)[1];
      return { rows: (tables[name] ?? []).map((r) => ({ sid: r.source_chunk_id ?? r.source_row_id, part_index: r.part_index, text: r.text ?? r.content, embedding: r.embedding, profile: r.profile })) };
    }
    if (s.includes('WHERE embedding IS NULL OR vector_dims')) {
      const name = s.match(/FROM (\S+)/)[1];
      return { rows: [{ n: (tables[name] ?? []).filter((r) => r.embedding == null).length }] };
    }
    if (s.includes('count(*)::int AS n FROM tickets.ticket_embeddings')) {
      return { rows: [{ n: tables['tickets.ticket_embeddings'].length }] };
    }
    if (s.includes('ALTER TABLE') && s.includes('RENAME TO')) {
      const m = s.match(/ALTER TABLE (\S+) RENAME TO (\S+)/);
      const from = m[1];
      const to = canonName(from, m[2]);
      tables[to] = tables[from] ?? [];
      delete tables[from];
      return { rows: [] };
    }
    if (s.includes('DROP CONSTRAINT')) return { rows: [] };
    if (s.includes('ADD CONSTRAINT')) return { rows: [] };
    if (s.includes('UPDATE knowledge.collections SET embedding_model')) {
      if (s.includes('id = ANY')) {
        const ids = params[0] ?? [];
        for (const c of tables['knowledge.collections']) {
          if (ids.includes(c.id)) c.embedding_model = 'bge-m3';
        }
      } else {
        for (const c of tables['knowledge.collections']) {
          if (c.embedding_model === 'bge-m3') c.embedding_model = 'embeddinggemma-300m';
        }
      }
      return { rows: [] };
    }
    if (s.includes('FROM knowledge.chunks GROUP BY')) {
      const counts = {};
      for (const r of tables[resolveKey('knowledge.chunks')]) counts[r.collection_id] = (counts[r.collection_id] ?? 0) + 1;
      return { rows: Object.entries(counts).map(([id, cnt]) => ({ id, cnt })) };
    }
    if (s.includes('DELETE FROM coaching.questionnaire_insights_cache')) return { rows: [] };
    throw new Error(`fake-db: unexpected query: ${s.slice(0, 120)}`);
  }

  const db = {
    query,
    log,
    tables,
    connect: async () => ({ query, release: () => {} }),
  };
  return db;
}

const BIG = `Titel\n${'Deutscher Satz mit Umlauten äöü. '.repeat(120)}`;

test('prepare legt Generation, Shadows und Lock an; Doppel- und Parallelfehler', async () => {
  const db = makeFakeDb();
  const res = await prepare(db, 't1');
  assert.equal(res.kShadow, 'knowledge.chunks_gemma_t1');
  const gen = await getGeneration(db, 't1');
  assert.equal(gen.phase, 'prepared');
  assert.equal(gen.writer_locked, true);
  assert.equal(gen.active, false);
  assert.ok(logHas(db, 'CREATE TRIGGER'));
  await assert.rejects(prepare(db, 't1'), /existiert bereits/);
  await assert.rejects(prepare(db, 't2'), /writer lock/);
  await assert.rejects(prepare(db, 'BAD ID!'), /invalid --run-id/);
  await assert.rejects(prepare(db, 'HAS-DASH'), /identifier-safe/);
});

function logHas(db, needle) {
  return db.log.some((s) => s.includes(needle));
}

test('unbekannte Run-ID, Modell- und Parallelfehler scheitern geschlossen', async () => {
  const db = makeFakeDb();
  await assert.rejects(rollback(db, 'nope'), /unbekannt/);
  await assert.rejects(verify(db, 'nope'), /unbekannt/);
  await assert.rejects(cutover(db, 'nope'), /unbekannt/);
});

test('knowledge-Reindex zerlegt >2048-Quellen verlustfrei mit Herkunft', async () => {
  const db = makeFakeDb({ knowledge: [
    { id: 'k1', document_id: 'd1', collection_id: 'c1', text: 'kurz', metadata: {} },
    { id: 'k2', document_id: 'd1', collection_id: 'c1', text: BIG, metadata: {} },
  ] });
  await prepare(db, 'r1');
  const res = await reindexKnowledge({ pool: db, embedUrl: 'http://x', fetchImpl: makeFakeFetch(), runId: 'r1' });
  assert.equal(res.source_total, 2);
  const rows = db.tables['knowledge.chunks_gemma_r1'];
  assert.ok(rows.length >= 3);
  const k2 = rows.filter((r) => r.source_chunk_id === 'k2');
  assert.ok(k2.length >= 2);
  assert.equal(k2.map((r) => r.text).join(''), BIG);
  assert.ok(k2.every((r) => r.profile === DENSE_PROFILE && r.embedding.length === 768));
  assert.deepEqual(k2.map((r) => r.part_index), [...k2.keys()]);
});

test('Resume nutzt nur fertige profilidentische Eintraege, ohne Luecken', async () => {
  const db = makeFakeDb({ knowledge: [
    { id: 'k1', document_id: 'd1', collection_id: 'c1', text: 'eins', metadata: {} },
    { id: 'k2', document_id: 'd1', collection_id: 'c1', text: 'zwei', metadata: {} },
    { id: 'k3', document_id: 'd1', collection_id: 'c1', text: 'drei', metadata: {} },
  ] });
  await prepare(db, 'r2');
  await assert.rejects(
    reindexKnowledge({ pool: db, embedUrl: 'http://x', fetchImpl: makeFakeFetch({ failAfter: 3 }), runId: 'r2' }),
    /boom/,
  );
  const res = await reindexKnowledge({ pool: db, embedUrl: 'http://x', fetchImpl: makeFakeFetch(), runId: 'r2' });
  assert.equal(res.source_total, 3);
  const rows = db.tables['knowledge.chunks_gemma_r2'];
  const keys = rows.map((r) => `${r.source_chunk_id}#${r.part_index}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(rows.length, 3);
});

test('verify verlangt Coverage, Rekonstruktion, 768D und Fingerprint', async () => {
  const db = makeFakeDb();
  await prepare(db, 'v1');
  await assert.rejects(verify(db, 'v1'), /ohne Teilchunk/);
  await reindexKnowledge({ pool: db, embedUrl: 'http://x', fetchImpl: makeFakeFetch(), runId: 'v1' });
  await reindexCode({ pool: db, embedUrl: 'http://x', fetchImpl: makeFakeFetch(), runId: 'v1' });
  const ok = await verify(db, 'v1');
  assert.ok(ok.snapshot);
  assert.equal((await getGeneration(db, 'v1')).phase, 'verified');

  db.tables['knowledge.chunks_gemma_v1'][0].profile = 'bge-m3:1024:Q8_0:v1';
  await setPhase(db, 'v1', 'indexing');
  await assert.rejects(verify(db, 'v1'), /Fremdprofil/);
});

test('verify erkennt Drift und Null-Vektoren', async () => {
  const db = makeFakeDb();
  await prepare(db, 'v2');
  await reindexKnowledge({ pool: db, embedUrl: 'http://x', fetchImpl: makeFakeFetch(), runId: 'v2' });
  db.tables['knowledge.chunks'].push({ id: 'k9', document_id: 'd1', collection_id: 'c1', text: 'spaet', metadata: {} });
  await assert.rejects(verify(db, 'v2'), /drift/i);

  const db2 = makeFakeDb();
  await prepare(db2, 'v3');
  await reindexKnowledge({ pool: db2, embedUrl: 'http://x', fetchImpl: makeFakeFetch(), runId: 'v3' });
  db2.tables['knowledge.chunks_gemma_v3'][0].embedding = null;
  await assert.rejects(verify(db2, 'v3'), /Null/);
});

test('cutover ohne verified scheitert; dry-run mutiert nichts', async () => {
  const db = makeFakeDb();
  await prepare(db, 'c1');
  await assert.rejects(cutover(db, 'c1'), /erwartet 'verified'/);
});

test('cutover-Swap ist atomar; injizierter Rename-Fehler erhaelt Bestand', async () => {
  const db = makeFakeDb();
  await prepare(db, 'c2');
  await reindexKnowledge({ pool: db, embedUrl: 'http://x', fetchImpl: makeFakeFetch(), runId: 'c2' });
  await reindexCode({ pool: db, embedUrl: 'http://x', fetchImpl: makeFakeFetch(), runId: 'c2' });
  await verify(db, 'c2');
  const res = await cutover(db, 'c2');
  assert.ok(res.snapshot);
  assert.ok(db.tables['knowledge.chunks_bge_backup_c2'].length === 1);
  assert.equal(db.tables['knowledge.collections'][0].embedding_model, 'embeddinggemma-300m');
  assert.equal((await getGeneration(db, 'c2')).phase, 'active');

  const db2 = makeFakeDb({ failOn: 'RENAME TO' });
  await prepare(db2, 'c3');
  await reindexKnowledge({ pool: db2, embedUrl: 'http://x', fetchImpl: makeFakeFetch(), runId: 'c3' });
  await reindexCode({ pool: db2, embedUrl: 'http://x', fetchImpl: makeFakeFetch(), runId: 'c3' });
  await verify(db2, 'c3');
  await assert.rejects(cutover(db2, 'c3'), /injected failure/);
  assert.ok(db2.tables['knowledge.chunks'].length === 1);
  assert.equal((await getGeneration(db2, 'c3')).phase, 'verified');
});

test('rollback stellt Tabellen und Labels wieder her; nach neuen Writes verweigert', async () => {
  const db = makeFakeDb();
  await prepare(db, 'b1');
  await reindexKnowledge({ pool: db, embedUrl: 'http://x', fetchImpl: makeFakeFetch(), runId: 'b1' });
  await reindexCode({ pool: db, embedUrl: 'http://x', fetchImpl: makeFakeFetch(), runId: 'b1' });
  await verify(db, 'b1');
  await cutover(db, 'b1');
  const back = await rollback(db, 'b1');
  assert.equal(back.rolled_back, true);
  assert.equal(db.tables['knowledge.collections'][0].embedding_model, 'bge-m3');
  assert.equal((await getGeneration(db, 'b1')).phase, 'failed');

  const db2 = makeFakeDb();
  await prepare(db2, 'b2');
  await reindexKnowledge({ pool: db2, embedUrl: 'http://x', fetchImpl: makeFakeFetch(), runId: 'b2' });
  await reindexCode({ pool: db2, embedUrl: 'http://x', fetchImpl: makeFakeFetch(), runId: 'b2' });
  await verify(db2, 'b2');
  await cutover(db2, 'b2');
  // Freigabe simulieren + neuer Write:
  const g = await getGeneration(db2, 'b2');
  g.writer_locked = false;
  db2.tables['knowledge.chunks'].push({ id: 'kn', document_id: 'd1', collection_id: 'c1', text: 'neu', metadata: {} });
  await assert.rejects(rollback(db2, 'b2'), /verweigert/);
});

test('Writer-Gate wird als Trigger verdrahtet', async () => {
  const db = makeFakeDb();
  await enableWriterGate(db, 'g1');
  assert.ok(logHas(db, 'dense_migration_gate'));
  assert.ok(logHas(db, 'knowledge.chunks'));
  await disableWriterGate(db, 'g1');
});
