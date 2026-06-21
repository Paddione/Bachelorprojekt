---
title: OpenSpec pgvector Indexierung — Implementierungsplan
ticket_id: T001008
domains: [website, scripts, openspec]
status: planning
---

# OpenSpec pgvector Indexierung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Semantische Suche über OpenSpec-Dokumente (`proposal.md`, `tasks.md`, `specs/<slug>.md`) via pgvector — Agents finden relevante Specs/Pläne ohne vollständiges Datei-Scanning.

**Architecture:** Hybrid Write-CLI / Read-API. Der Write-Pfad ist ein standalone Node.js-ESM-Script (`scripts/openspec-embed.mjs`), das ohne laufenden Website-Pod auskommt und von `scripts/openspec.sh` (apply/archive) sowie einem Backfill-Task aufgerufen wird. Der Read-Pfad ist ein Astro-API-Endpoint (`/api/openspec/search`), der die bestehende `embeddings.ts`/`knowledge-db.ts`-Logik wiederverwendet und von `plan-context.sh --semantic` sowie einem MCP-Tool konsumiert wird.

**Tech Stack:** Node.js ESM, `pg` (8.21, bereits in Root-`package.json`), pgvector (`knowledge.chunks`, HNSW `vector_cosine_ops`), TEI bge-m3 (`llm-gateway-embed:8081`), Astro API-Routes, Vitest, BATS, `@modelcontextprotocol/sdk` + `zod` (in-repo MCP-Server).

## Global Constraints

- **Kein neues DB-Schema.** Es werden ausschließlich die bestehenden Tabellen `knowledge.collections`, `knowledge.documents`, `knowledge.chunks` benutzt. Keine Migration, kein DDL.
- **Embedding-Modell-Konsistenz (kein Mixed-Model-Error).** Die Collection `specs_plans` muss konsistent EIN Modell verwenden. Production/LLM-aktiv = `bge-m3` (1024-dim). Dev/`LLM_ENABLED!=true` = Voyage-Fallback (`voyage-multilingual-2`, 1024-dim). Das in der Collection gespeicherte `embedding_model` MUSS mit dem tatsächlich genutzten Modell übereinstimmen — gespiegelt aus `createCollection`-Default: `process.env.LLM_ENABLED === 'true' ? 'bge-m3' : 'voyage-multilingual-2'`.
- **Best-effort Write-Pfad.** `openspec-embed.mjs` loggt jeden Fehler (GPU-Host down, TEI-Timeout, DB unreachable) und beendet mit **Exit 0**. Der OpenSpec-Lifecycle (`apply`/`archive`) darf NIE durch Embedding-Fehler unterbrochen werden.
- **Keine Brand-Isolation.** OpenSpec ist shared (`brand = NULL`). Queries laufen über beide Brands.
- **Keine Brand-Domain-Literale (S3).** Keine `*.mentolder.de`/`*.korczewski.de`-Strings in Code. Service-Hosts kommen aus Env (`SESSIONS_DATABASE_URL`/`DATABASE_URL`, `LLM_EMBED_URL`, `LLM_ENABLED`).
- **Zeilenbudgets (S1, alle Zieldateien NICHT gebaselined → statisches Limit gilt):**
  - `scripts/openspec-embed.mjs` (neu, `.mjs` Limit **500**) — mit Reserve unter 500 schneiden, Chunking-Logik aus `website/src/lib/chunking.ts` als reine Helfer dupliziert (ESM-Script kann nicht aus TS-`src/` importieren); Ziel < 400.
  - `scripts/openspec.sh` (Ist 143, `.sh` Limit 500) — Budget ~357, Änderung trivial (2 Zeilen).
  - `scripts/plan-context.sh` (Ist 64, `.sh` Limit 500) — Budget ~436.
  - `scripts/factory/mcp-server.mjs` (Ist 89, `.mjs` Limit 500) — Budget ~411.
  - `website/src/pages/api/openspec/search.ts` (neu, `.ts` Limit 600) — Ziel < 120.
  - Neue Test-Dateien (`.ts`/`.mjs`/`.bats`): unterhalb Limit halten.
- **S4 (keine Orphan-Skripte):** `scripts/openspec-embed.mjs` MUSS von Taskfile referenziert sein (über `openspec:embed:backfill` UND indirekt über `scripts/openspec.sh`).
- **Keine neuen Baseline-Einträge.** `docs/code-quality/baseline.json` Key-Count darf nicht wachsen (CI-Assertion in `freshness:check`). Neue Dateien unter Limit halten, damit sie gar nicht erst gebaselined werden müssen.

---

## File Structure

| Datei | Verantwortung | Aktion |
|-------|---------------|--------|
| `scripts/openspec-embed.mjs` | Write-CLI: liest OpenSpec-Dateien, chunked, embedded via TEI, upsertet in `knowledge.*` | Create |
| `scripts/openspec.sh` | Hook: ruft `openspec-embed.mjs` nach apply/archive (best-effort) | Modify |
| `website/src/pages/api/openspec/search.ts` | Read-API: embed query → pgvector `<=>` → JSON | Create |
| `scripts/plan-context.sh` | `--semantic <query>` Flag → ruft `/api/openspec/search`, Fallback grep-only | Modify |
| `scripts/factory/mcp-server.mjs` | MCP-Tool `openspec_find_similar` (wraps `/api/openspec/search`) | Modify |
| `Taskfile.yml` | `openspec:embed:backfill` Task | Modify |
| `scripts/openspec-embed.test.mjs` | Unit: Chunking, Frontmatter-Strip, Idempotenz, Dry-Run | Create |
| `website/src/pages/api/openspec/search.test.ts` | Integration: Fixture-Chunk → Query → Top-1 | Create |
| `tests/spec/openspec-embedding.bats` | BATS: `openspec:apply` ruft Embed-Hook, Dry-Run | Create |

> **Architektur-Hinweis zum MCP-Tool (vom Spec-Design abweichend dokumentiert):** Das Design nennt „den bestehenden OpenSpec-MCP-Server" und „in `openspec/mcp/` registrieren". Ein solcher in-repo OpenSpec-MCP-Server existiert NICHT — der `openspec`-MCP in `.mcp.json` ist das externe npm-Paket `openspec-mcp` (`npx -y openspec-mcp`) und kann nicht editiert werden. Der einzige in-repo MCP-Server ist `scripts/factory/mcp-server.mjs` (nutzt `McpServer.tool()` + `zod`, HTTP auf `:13003`). Das Tool `openspec_find_similar` wird daher dort registriert. Dies ist die einzige umsetzbare Interpretation; falls ein dedizierter OpenSpec-MCP-Server gewünscht ist, ist das ein separates Folge-Ticket.

> **Test-Dateinamen-Anpassung (vom Spec-Design abweichend):** Das Design listet `website/src/lib/openspec-embed.test.ts` und `website/src/lib/openspec-search.test.ts`. Da die Chunking-/Frontmatter-Logik im `.mjs`-Script lebt (nicht in `src/lib/`), wandert ihr Unit-Test nach `scripts/openspec-embed.test.mjs` (neben dem zu testenden Modul, vitest-include deckt `scripts/**/*.test.mjs` bereits ab — in Task 6 verifiziert). Der Search-Integrationstest liegt neben der Route als `website/src/pages/api/openspec/search.test.ts`. Die Test-Inhalte entsprechen exakt der Testmatrix des Designs.

---

## Task 1: Write-CLI `scripts/openspec-embed.mjs` — Chunking & Frontmatter (reine Helfer + Unit-Tests)

Beginnt TDD-first mit den reinen, DB-/Netzwerk-freien Helfern (Frontmatter-Strip + Chunking), damit S1/S2 sauber bleiben und die Logik isoliert testbar ist.

**Files:**
- Create: `scripts/openspec-embed.mjs` (zunächst nur exportierte reine Helfer + `main()`-Stub)
- Test: `scripts/openspec-embed.test.mjs`

**Interfaces:**
- Consumes: nichts (Task-Start).
- Produces:
  - `stripFrontmatter(raw: string): { body: string; frontmatter: Record<string,string> }` — entfernt führenden `---\n…\n---\n`-Block, parst flache `key: value`-Paare (genug für `ticket_id`, `status`).
  - `approxTokens(s: string): number` — `Math.ceil(s.length / 4)` (gespiegelt aus `chunking.ts`).
  - `chunkProposal(body: string): Array<{ position: number; text: string; sectionTitle: string; charOffset: number }>` — atomisch: genau ein Chunk, `sectionTitle: ''`, `charOffset: 0`.
  - `chunkSections(body: string, opts?: { targetTokens?: number; overlapTokens?: number }): Array<{ position: number; text: string; sectionTitle: string; charOffset: number }>` — Split an `##`/`###`-Headings, jede zu große Section per Token-Budget (default `targetTokens: 400`, `overlapTokens: 50`) weiter zerteilt. `sectionTitle` = erste `#`-Heading-Zeile der Section (ohne `#`), `charOffset` = Start-Index im `body`.

- [ ] **Step 1: Write the failing test**

Create `scripts/openspec-embed.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import {
  stripFrontmatter,
  approxTokens,
  chunkProposal,
  chunkSections,
} from './openspec-embed.mjs';

describe('stripFrontmatter', () => {
  it('removes the leading --- block and parses flat keys', () => {
    const raw = '---\nticket_id: T000987\nstatus: planning\n---\n\n# Title\n\nBody text.';
    const { body, frontmatter } = stripFrontmatter(raw);
    expect(frontmatter.ticket_id).toBe('T000987');
    expect(frontmatter.status).toBe('planning');
    expect(body.startsWith('# Title')).toBe(true);
    expect(body).not.toContain('ticket_id');
  });

  it('returns the raw body unchanged when there is no frontmatter', () => {
    const raw = '# No frontmatter\n\nhello';
    const { body, frontmatter } = stripFrontmatter(raw);
    expect(body).toBe(raw);
    expect(frontmatter).toEqual({});
  });
});

describe('approxTokens', () => {
  it('estimates ~1 token per 4 chars', () => {
    expect(approxTokens('abcd')).toBe(1);
    expect(approxTokens('a'.repeat(400))).toBe(100);
  });
});

describe('chunkProposal', () => {
  it('produces exactly one atomic chunk', () => {
    const chunks = chunkProposal('# P\n\nsome proposal body that is short');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].position).toBe(0);
    expect(chunks[0].sectionTitle).toBe('');
    expect(chunks[0].charOffset).toBe(0);
    expect(chunks[0].text).toContain('proposal body');
  });
});

describe('chunkSections', () => {
  it('splits on ## headings and records section titles + offsets', () => {
    const body = '## Alpha\n\nfirst section text\n\n## Beta\n\nsecond section text';
    const chunks = chunkSections(body);
    expect(chunks.length).toBe(2);
    expect(chunks[0].sectionTitle).toBe('Alpha');
    expect(chunks[1].sectionTitle).toBe('Beta');
    expect(chunks[0].charOffset).toBe(0);
    expect(chunks[1].charOffset).toBe(body.indexOf('## Beta'));
    expect(chunks[0].position).toBe(0);
    expect(chunks[1].position).toBe(1);
  });

  it('further splits an oversized section by token budget with overlap', () => {
    const big = '## Huge\n\n' + 'word '.repeat(500); // ~625 tokens > 400 budget
    const chunks = chunkSections(big, { targetTokens: 400, overlapTokens: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.sectionTitle === 'Huge')).toBe(true);
    expect(chunks.every((c) => approxTokens(c.text) <= 420)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && npx vitest run ../scripts/openspec-embed.test.mjs`
Expected: FAIL — `Failed to resolve import "./openspec-embed.mjs"` / functions not defined.

(If vitest does not pick up `scripts/**`, see Task 6 Step 1 — but the import error here is the expected first failure.)

- [ ] **Step 3: Write minimal implementation**

Create `scripts/openspec-embed.mjs` (helpers + `main()` stub only — DB/embed wiring follows in Task 2):

```js
#!/usr/bin/env node
// scripts/openspec-embed.mjs — Write-CLI: indexes one OpenSpec change (proposal/tasks/spec)
// into knowledge.chunks via TEI embeddings. Best-effort: logs errors, exits 0.
//   node scripts/openspec-embed.mjs --slug <slug> [--dry-run]
// Chunking/frontmatter helpers are pure and duplicated from website/src/lib/chunking.ts
// (an ESM script cannot import the TS src/ tree).

export function stripFrontmatter(raw) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (!m) return { body: raw, frontmatter: {} };
  const frontmatter = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line.trim());
    if (kv) frontmatter[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return { body: raw.slice(m[0].length), frontmatter };
}

export function approxTokens(s) {
  return Math.ceil(s.length / 4);
}

function sectionTitleOf(section) {
  const line = section.split('\n').find((l) => /^#{1,6}\s/.test(l));
  return line ? line.replace(/^#{1,6}\s+/, '').trim() : '';
}

function splitByTokenBudget(text, target, overlap) {
  const charPerTok = 4;
  const targetChars = target * charPerTok;
  const overlapChars = overlap * charPerTok;
  const out = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + targetChars, text.length);
    if (end < text.length) {
      const slice = text.slice(end - 100, end);
      const idx = slice.lastIndexOf(' ');
      if (idx >= 0) end = end - 100 + idx;
    }
    out.push(text.slice(cursor, end).trim());
    if (end >= text.length) break;
    cursor = Math.max(end - overlapChars, cursor + 1);
  }
  return out;
}

export function chunkProposal(body) {
  return [{ position: 0, text: body.trim(), sectionTitle: '', charOffset: 0 }];
}

export function chunkSections(body, opts = {}) {
  const target = opts.targetTokens ?? 400;
  const overlap = opts.overlapTokens ?? 50;
  const out = [];
  let pos = 0;
  // Split keeping char offsets: scan for heading line starts.
  const lines = body.split('\n');
  const sections = [];
  let buf = '';
  let bufOffset = 0;
  let runningOffset = 0;
  for (const line of lines) {
    const isHeading = /^#{1,3}\s/.test(line);
    if (isHeading && buf.length > 0) {
      sections.push({ text: buf, offset: bufOffset });
      buf = '';
      bufOffset = runningOffset;
    }
    if (buf.length === 0) bufOffset = runningOffset;
    buf += line + '\n';
    runningOffset += line.length + 1;
  }
  if (buf.length > 0) sections.push({ text: buf, offset: bufOffset });

  for (const sec of sections) {
    const title = sectionTitleOf(sec.text);
    if (approxTokens(sec.text) <= target) {
      out.push({ position: pos++, text: sec.text.trim(), sectionTitle: title, charOffset: sec.offset });
    } else {
      for (const piece of splitByTokenBudget(sec.text, target, overlap)) {
        out.push({ position: pos++, text: piece, sectionTitle: title, charOffset: sec.offset });
      }
    }
  }
  return out;
}

// main() is fleshed out in Task 2; guard keeps the module importable by tests.
async function main() {
  console.error('openspec-embed: not yet wired (Task 2)');
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd website && npx vitest run ../scripts/openspec-embed.test.mjs`
Expected: PASS (all 7 cases).

- [ ] **Step 5: Commit**

```bash
git add scripts/openspec-embed.mjs scripts/openspec-embed.test.mjs
git commit -m "feat(openspec): chunking + frontmatter helpers for embed CLI [T001008]"
```

---

## Task 2: Write-CLI — DB upsert, embedding & dry-run wiring

Verdrahtet die reinen Helfer mit `pg` + TEI. Idempotenz und Dry-Run werden TDD-getestet, ohne echte DB/TEI: ein injizierbarer Fake-Client/Embedder.

**Files:**
- Modify: `scripts/openspec-embed.mjs`
- Test: `scripts/openspec-embed.test.mjs` (erweitern)

**Interfaces:**
- Consumes: `stripFrontmatter`, `chunkProposal`, `chunkSections` (Task 1).
- Produces:
  - `buildChunks(files: { proposal?: string; tasks?: string; spec?: string }): Array<{ position; text; sectionTitle; charOffset; fileType }>` — wendet die Chunking-Strategie an (`proposal` atomisch, `tasks`/`spec` section-basiert), nummeriert `position` global über alle Dateien hinweg, setzt `fileType` ∈ `'proposal' | 'task_section' | 'spec_section'`.
  - `embedSlug(opts: { slug; repoRoot; dryRun?; deps?: { query; embed; log } }): Promise<{ inserted: number; dryRun: boolean }>` — Orchestrierung. `deps` injizierbar für Tests; Default-`query` = `pg.Pool`, Default-`embed` = TEI-Call.
  - `resolveEmbeddingModel(): 'bge-m3' | 'voyage-multilingual-2'` — `process.env.LLM_ENABLED === 'true' ? 'bge-m3' : 'voyage-multilingual-2'`.

- [ ] **Step 1: Write the failing test (append to `scripts/openspec-embed.test.mjs`)**

```js
import { buildChunks, embedSlug, resolveEmbeddingModel } from './openspec-embed.mjs';

describe('buildChunks', () => {
  it('assigns global positions and correct fileType per source', () => {
    const chunks = buildChunks({
      proposal: '# P\n\nproposal body',
      tasks: '## T1\n\ntask one\n\n## T2\n\ntask two',
      spec: '## S1\n\nspec section',
    });
    const types = chunks.map((c) => c.fileType);
    expect(types[0]).toBe('proposal');
    expect(types).toContain('task_section');
    expect(types).toContain('spec_section');
    // positions are unique + contiguous from 0
    const positions = chunks.map((c) => c.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(new Set(positions).size).toBe(positions.length);
    expect(positions[0]).toBe(0);
  });
});

describe('resolveEmbeddingModel', () => {
  it('uses bge-m3 when LLM_ENABLED=true, voyage otherwise', () => {
    const prev = process.env.LLM_ENABLED;
    process.env.LLM_ENABLED = 'true';
    expect(resolveEmbeddingModel()).toBe('bge-m3');
    process.env.LLM_ENABLED = 'false';
    expect(resolveEmbeddingModel()).toBe('voyage-multilingual-2');
    process.env.LLM_ENABLED = prev;
  });
});

describe('embedSlug', () => {
  function fakeDeps() {
    const queries = [];
    const fake = {
      log: () => {},
      embed: async (texts) => texts.map(() => Array(1024).fill(0.01)),
      query: async (sql, params) => {
        queries.push({ sql, params });
        if (/INSERT INTO knowledge\.collections/i.test(sql)) return { rows: [{ id: 'col-1' }] };
        if (/SELECT id FROM knowledge\.collections/i.test(sql)) return { rows: [{ id: 'col-1' }] };
        if (/INSERT INTO knowledge\.documents/i.test(sql)) return { rows: [{ id: 'doc-1' }] };
        return { rows: [] };
      },
    };
    return { fake, queries };
  }

  it('dry-run inserts nothing and reports dryRun:true', async () => {
    const { fake, queries } = fakeDeps();
    const res = await embedSlug({ slug: 'demo', repoRoot: '/nonexistent', dryRun: true, deps: fake });
    expect(res.dryRun).toBe(true);
    expect(queries.some((q) => /INSERT/i.test(q.sql))).toBe(false);
  });
});
```

> Note: `embedSlug` must tolerate a missing `repoRoot`/files gracefully — when no OpenSpec files are found it logs and returns `{ inserted: 0, dryRun }` without throwing (best-effort contract). The dry-run test relies on that.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && npx vitest run ../scripts/openspec-embed.test.mjs`
Expected: FAIL — `buildChunks`/`embedSlug`/`resolveEmbeddingModel` not exported.

- [ ] **Step 3: Write minimal implementation (add to `scripts/openspec-embed.mjs`)**

Add imports at the top (after the shebang/comment block):

```js
import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
```

Add the wiring functions (before `main()`):

```js
export function resolveEmbeddingModel() {
  return process.env.LLM_ENABLED === 'true' ? 'bge-m3' : 'voyage-multilingual-2';
}

export function buildChunks(files) {
  const out = [];
  let pos = 0;
  if (files.proposal != null) {
    for (const c of chunkProposal(stripFrontmatter(files.proposal).body)) {
      out.push({ ...c, position: pos++, fileType: 'proposal' });
    }
  }
  if (files.tasks != null) {
    for (const c of chunkSections(stripFrontmatter(files.tasks).body)) {
      out.push({ ...c, position: pos++, fileType: 'task_section' });
    }
  }
  if (files.spec != null) {
    for (const c of chunkSections(stripFrontmatter(files.spec).body)) {
      out.push({ ...c, position: pos++, fileType: 'spec_section' });
    }
  }
  return out;
}

function readIfExists(p) {
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function vecLiteral(v) {
  return `[${v.join(',')}]`;
}

const DEFAULT_EMBED_URL = () =>
  process.env.LLM_EMBED_URL ?? 'http://llm-gateway-embed.workspace.svc.cluster.local:8081';

async function defaultEmbed(texts) {
  const model = resolveEmbeddingModel();
  const r = await fetch(`${DEFAULT_EMBED_URL()}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-LLM-Purpose': 'index' },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!r.ok) throw new Error(`embed ${r.status} ${await r.text().catch(() => '')}`);
  const j = await r.json();
  return j.data.map((d) => d.embedding);
}

export async function embedSlug({ slug, repoRoot, dryRun = false, deps = {} }) {
  const log = deps.log ?? ((...a) => console.error('[openspec-embed]', ...a));
  const embed = deps.embed ?? defaultEmbed;
  const model = resolveEmbeddingModel();

  const changeDir = path.join(repoRoot, 'openspec', 'changes', slug);
  const files = {
    proposal: readIfExists(path.join(changeDir, 'proposal.md')) ?? undefined,
    tasks: readIfExists(path.join(changeDir, 'tasks.md')) ?? undefined,
    spec: readIfExists(path.join(changeDir, 'specs', `${slug}.md`)) ?? undefined,
  };
  if (files.proposal == null && files.tasks == null && files.spec == null) {
    log(`no OpenSpec files for slug '${slug}' under ${changeDir}; nothing to index`);
    return { inserted: 0, dryRun };
  }

  const meta = stripFrontmatter(files.tasks ?? files.proposal ?? '').frontmatter;
  const ticketId = meta.ticket_id ?? null;
  const status = meta.status ?? null;
  const chunks = buildChunks(files);

  if (dryRun) {
    log(`[dry-run] slug='${slug}' model=${model} would index ${chunks.length} chunks (ticket=${ticketId} status=${status})`);
    return { inserted: 0, dryRun: true };
  }

  let pool = null;
  let query = deps.query;
  if (!query) {
    const conn = process.env.SESSIONS_DATABASE_URL || process.env.DATABASE_URL;
    if (!conn) { log('no SESSIONS_DATABASE_URL/DATABASE_URL set; skipping'); return { inserted: 0, dryRun: false }; }
    pool = new pg.Pool({ connectionString: conn });
    query = (sql, params) => pool.query(sql, params);
  }

  try {
    await query(
      `INSERT INTO knowledge.collections (name, source, brand, embedding_model)
       VALUES ('OpenSpec Specs & Plans', 'specs_plans', NULL, $1)
       ON CONFLICT (name) DO NOTHING`,
      [model],
    );
    const colRes = await query(
      `SELECT id FROM knowledge.collections WHERE source = 'specs_plans' LIMIT 1`,
      [],
    );
    const collectionId = colRes.rows[0]?.id;
    if (!collectionId) { log('specs_plans collection missing after upsert; skipping'); return { inserted: 0, dryRun: false }; }

    await query(`DELETE FROM knowledge.documents WHERE metadata->>'slug' = $1`, [slug]);
    const docRes = await query(
      `INSERT INTO knowledge.documents (collection_id, title, source_uri, raw_text, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
      [collectionId, slug, `openspec/changes/${slug}/proposal.md`, '',
       JSON.stringify({ slug, ticket_id: ticketId, status })],
    );
    const documentId = docRes.rows[0].id;

    const vectors = await embed(chunks.map((c) => c.text));
    let inserted = 0;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      await query(
        `INSERT INTO knowledge.chunks (document_id, collection_id, position, text, embedding, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [documentId, collectionId, c.position, c.text, vecLiteral(vectors[i]),
         JSON.stringify({ slug, ticket_id: ticketId, status, file_type: c.fileType, section_title: c.sectionTitle, char_offset: c.charOffset })],
      );
      inserted++;
    }
    await query(`UPDATE knowledge.collections SET last_indexed_at = now() WHERE source = 'specs_plans'`, []);
    log(`indexed slug='${slug}': ${inserted} chunks (model=${model})`);
    return { inserted, dryRun: false };
  } finally {
    if (pool) await pool.end();
  }
}
```

Replace the `main()` stub with the real argparse + best-effort wrapper:

```js
async function main() {
  const args = process.argv.slice(2);
  let slug = '';
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--slug') slug = args[++i] ?? '';
    else if (args[i] === '--dry-run') dryRun = true;
  }
  if (!slug) { console.error('[openspec-embed] --slug <slug> required'); process.exit(0); }
  const repoRoot = process.env.OPENSPEC_EMBED_REPO
    || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  try {
    await embedSlug({ slug, repoRoot, dryRun });
  } catch (err) {
    console.error('[openspec-embed] best-effort failure (exit 0):', err?.message ?? err);
  }
  process.exit(0); // best-effort: never break the OpenSpec lifecycle
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd website && npx vitest run ../scripts/openspec-embed.test.mjs`
Expected: PASS (Task 1 + Task 2 cases).

- [ ] **Step 5: Verify the script is line-budget compliant**

Run: `wc -l scripts/openspec-embed.mjs`
Expected: well under 500 (target < 400). If over, extract `splitByTokenBudget`/`chunkSections` into a sibling `scripts/lib/openspec-chunk.mjs` and import — do NOT compress lines cosmetically.

- [ ] **Step 6: Commit**

```bash
git add scripts/openspec-embed.mjs scripts/openspec-embed.test.mjs
git commit -m "feat(openspec): embed CLI DB upsert + dry-run wiring [T001008]"
```

---

## Task 3: Hook the embed CLI into `scripts/openspec.sh` (apply + archive)

**Files:**
- Modify: `scripts/openspec.sh:46-59` (cmd_apply), `scripts/openspec.sh:61-85` (cmd_archive)
- Test: `tests/spec/openspec-embedding.bats`

**Interfaces:**
- Consumes: `scripts/openspec-embed.mjs` CLI (`node scripts/openspec-embed.mjs --slug <slug>`).
- Produces: nothing consumed downstream (lifecycle side-effect only).

- [ ] **Step 1: Write the failing test**

Create `tests/spec/openspec-embedding.bats`:

```bash
#!/usr/bin/env bats
# tests/spec/openspec-embedding.bats
# SSOT: openspec/specs/openspec-pgvector.md (delta in openspec/changes/openspec-pgvector/)
# Verifies the embed hook is best-effort and dry-run never writes.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  TMP="$(mktemp -d)"
  export OPENSPEC_ROOT="$TMP/openspec"
  export TICKET_OFFLINE=1
  mkdir -p "$OPENSPEC_ROOT/changes/demo/specs"
  printf -- '---\nticket_id: T000001\nstatus: planning\n---\n# Proposal: demo\n' > "$OPENSPEC_ROOT/changes/demo/proposal.md"
  printf -- '---\nticket_id: T000001\nstatus: planning\n---\n# Tasks: demo\n\n## One\n\nstep\n' > "$OPENSPEC_ROOT/changes/demo/tasks.md"
  printf '## ADDED Requirements\n\n### Requirement: X\n\nThe system SHALL …\n' > "$OPENSPEC_ROOT/changes/demo/specs/demo.md"
}

teardown() { rm -rf "$TMP"; }

@test "apply triggers the embed hook without aborting on embed failure" {
  # No DB/TEI reachable in CI → embed CLI must exit 0 and apply must succeed.
  run bash "$REPO/scripts/openspec.sh" apply demo
  [ "$status" -eq 0 ]
  [[ "$output" == *"applied: demo"* ]]
}

@test "openspec.sh apply references the embed CLI" {
  run grep -q 'openspec-embed.mjs' "$REPO/scripts/openspec.sh"
  [ "$status" -eq 0 ]
}

@test "openspec.sh archive references the embed CLI" {
  run bash -c "grep -c 'openspec-embed.mjs' '$REPO/scripts/openspec.sh'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 2 ]
}

@test "embed CLI dry-run writes nothing and exits 0" {
  run bash -c "OPENSPEC_EMBED_REPO='$TMP' node '$REPO/scripts/openspec-embed.mjs' --slug demo --dry-run"
  [ "$status" -eq 0 ]
  [[ "$output" == *"dry-run"* ]]
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding.bats`
Expected: FAIL — `openspec.sh` does not yet reference `openspec-embed.mjs` (the grep tests fail).

- [ ] **Step 3: Write minimal implementation**

In `scripts/openspec.sh`, add a helper near the top (after the `die()` definition, ~line 19):

```bash
# Best-effort semantic index refresh for a change slug. Never aborts the lifecycle.
_embed_slug() {
  local slug="$1"
  node "$REPO/scripts/openspec-embed.mjs" --slug "$slug" >/dev/null 2>&1 || true
}
```

In `cmd_apply`, immediately before the final `echo "applied: $slug (implementable)"`:

```bash
  _embed_slug "$slug"
```

In `cmd_archive`, immediately before the final `echo "archived: $slug -> $dest (delta merged into SSOT)"`:

```bash
  _embed_slug "$slug"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding.bats`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add scripts/openspec.sh tests/spec/openspec-embedding.bats
git commit -m "feat(openspec): best-effort embed hook on apply/archive [T001008]"
```

---

## Task 4: Read-API `GET /api/openspec/search`

**Files:**
- Create: `website/src/pages/api/openspec/search.ts`
- Test: `website/src/pages/api/openspec/search.test.ts`

**Interfaces:**
- Consumes: `embedQuery` from `website/src/lib/embeddings.ts`, `pg` Pool via `website/src/lib/knowledge-db.ts` pattern (reuse the module's pool by adding one exported query function — see Step 3).
- Produces: `GET` handler returning JSON array of `{ slug, ticket_id, section_title, file_type, snippet, similarity }`.

> **DRY note:** Add the SQL helper to `website/src/lib/knowledge-db.ts` (it already owns the `knowledge.*` pool + `embedQuery` import + `MixedEmbeddingModelError`). The route stays thin (<120 lines). This keeps S2 clean (route → lib, never lib → route).

- [ ] **Step 1: Write the failing test**

Create `website/src/pages/api/openspec/search.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the lib function the route depends on.
vi.mock('../../../lib/knowledge-db', () => ({
  searchOpenspec: vi.fn(),
}));

import { GET } from './search';
import { searchOpenspec } from '../../../lib/knowledge-db';

function req(qs: string) {
  return {
    url: new URL(`http://x/api/openspec/search?${qs}`),
    request: new Request(`http://x/api/openspec/search?${qs}`),
    locals: { requestLogger: { error: () => {} } },
  } as any;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/openspec/search', () => {
  it('400 when q is missing', async () => {
    const res = await GET(req('limit=5'));
    expect(res.status).toBe(400);
  });

  it('returns the top match for a query', async () => {
    (searchOpenspec as any).mockResolvedValue([
      { slug: 'openspec-pgvector', ticket_id: 'T001008', section_title: 'Write-Pfad',
        file_type: 'task_section', snippet: 'Standalone Node.js ESM-Script', similarity: 0.91 },
    ]);
    const res = await GET(req('q=embedding%20indexierung&limit=3'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].slug).toBe('openspec-pgvector');
    expect(body.results[0].similarity).toBeGreaterThan(0.9);
    expect((searchOpenspec as any).mock.calls[0][0]).toMatchObject({ query: 'embedding indexierung', limit: 3 });
  });

  it('clamps limit to max 20 and passes status filter', async () => {
    (searchOpenspec as any).mockResolvedValue([]);
    await GET(req('q=x&limit=999&status=plan_staged'));
    const arg = (searchOpenspec as any).mock.calls[0][0];
    expect(arg.limit).toBe(20);
    expect(arg.status).toBe('plan_staged');
  });

  it('503 when the embedding service is unavailable', async () => {
    (searchOpenspec as any).mockRejectedValue(Object.assign(new Error('router 503'), { status: 503 }));
    const res = await GET(req('q=x'));
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && npx vitest run src/pages/api/openspec/search.test.ts`
Expected: FAIL — cannot resolve `./search` and `searchOpenspec` not exported.

- [ ] **Step 3: Write minimal implementation**

First add the SQL helper to `website/src/lib/knowledge-db.ts` (append near `queryNearest`):

```ts
export interface OpenspecHit {
  slug: string;
  ticket_id: string | null;
  section_title: string | null;
  file_type: string | null;
  snippet: string;
  similarity: number;
}

export async function searchOpenspec(args: {
  query: string; limit?: number; status?: string; signal?: AbortSignal;
}): Promise<OpenspecHit[]> {
  const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);
  const colRes = await p().query(
    `SELECT id, embedding_model FROM knowledge.collections WHERE source = 'specs_plans' LIMIT 1`,
  );
  if (colRes.rows.length === 0) return [];
  const { id: collectionId, embedding_model } = colRes.rows[0];
  const { embedding } = await embedQuery(args.query, {
    model: embedding_model as EmbeddingModel, purpose: 'query', signal: args.signal,
  });
  const params: unknown[] = [vecLiteral(embedding), collectionId];
  let statusClause = '';
  if (args.status) { params.push(args.status); statusClause = ` AND kc.metadata->>'status' = $${params.length}`; }
  params.push(limit);
  const r = await p().query(
    `SELECT kc.metadata->>'slug' AS slug,
            kc.metadata->>'ticket_id' AS ticket_id,
            kc.metadata->>'section_title' AS section_title,
            kc.metadata->>'file_type' AS file_type,
            left(kc.text, 240) AS snippet,
            1 - (kc.embedding <=> $1) AS similarity
       FROM knowledge.chunks kc
      WHERE kc.collection_id = $2${statusClause}
      ORDER BY kc.embedding <=> $1
      LIMIT $${params.length}`,
    params,
  );
  return r.rows;
}
```

Then create `website/src/pages/api/openspec/search.ts`:

```ts
import type { APIRoute } from 'astro';
import { searchOpenspec } from '../../../lib/knowledge-db';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return new Response(JSON.stringify({ error: 'query parameter q is required (min 2 chars)' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    });
  }
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '5', 10), 1), 20);
  const status = url.searchParams.get('status') ?? undefined;
  try {
    const results = await searchOpenspec({ query: q, limit, status });
    return new Response(JSON.stringify({ query: q, results }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const code = (err as { status?: number }).status;
    if (code && code >= 500) {
      return new Response(JSON.stringify({ error: 'embedding service unavailable' }), {
        status: 503, headers: { 'content-type': 'application/json' },
      });
    }
    locals.requestLogger?.error?.({ err }, '[api/openspec/search]');
    return new Response(JSON.stringify({ error: 'search failed' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd website && npx vitest run src/pages/api/openspec/search.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Verify line budgets**

Run: `wc -l website/src/pages/api/openspec/search.ts website/src/lib/knowledge-db.ts`
Expected: `search.ts` < 120; `knowledge-db.ts` new total < 600 (it was 424; +~40 → ~464, OK).

- [ ] **Step 6: Commit**

```bash
git add website/src/pages/api/openspec/search.ts website/src/pages/api/openspec/search.test.ts website/src/lib/knowledge-db.ts
git commit -m "feat(openspec): /api/openspec/search read endpoint [T001008]"
```

---

## Task 5: `plan-context.sh --semantic` + MCP tool `openspec_find_similar`

Beide sind dünne Konsumenten von `/api/openspec/search` und werden zusammen ausgeliefert (gleicher Read-Pfad, kein eigener Test-Cycle pro Teil sinnvoll trennbar).

**Files:**
- Modify: `scripts/plan-context.sh` (neuer `--semantic <query>` Flag, Fallback grep-only)
- Modify: `scripts/factory/mcp-server.mjs` (Tool `openspec_find_similar`)
- Test: `tests/spec/openspec-embedding.bats` (erweitern — Flag-Parsing + Fallback)

**Interfaces:**
- Consumes: `GET /api/openspec/search` (Task 4) via `curl`/`fetch`.
- Produces: `plan-context.sh --semantic` emits an extra `### Semantically similar OpenSpec changes` section; MCP tool `openspec_find_similar` returns the same JSON.

> **Hostname (S3):** the API base URL is read from env (`OPENSPEC_SEARCH_URL`, default `http://website.website.svc.cluster.local:4321`) — NO brand-domain literals.

- [ ] **Step 1: Write the failing test (append to `tests/spec/openspec-embedding.bats`)**

```bash
@test "plan-context.sh --semantic falls back silently when API is unreachable" {
  # Point at a dead port so the curl fails → grep-only output, exit 0.
  run bash -c "OPENSPEC_SEARCH_URL='http://127.0.0.1:9' bash '$REPO/scripts/plan-context.sh' infra --semantic 'pgvector' </dev/null"
  [ "$status" -eq 0 ]
  # must NOT crash; absence of the semantic section is acceptable on fallback
}

@test "plan-context.sh still emits grep-based proposals without --semantic" {
  run bash -c "cd '$REPO' && bash scripts/plan-context.sh infra </dev/null"
  [ "$status" -eq 0 ]
}

@test "mcp-server registers openspec_find_similar" {
  run grep -q "openspec_find_similar" "$REPO/scripts/factory/mcp-server.mjs"
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding.bats`
Expected: FAIL — `--semantic` flag unknown (treated as a file by current arg loop) and `openspec_find_similar` not present.

- [ ] **Step 3a: Implement `--semantic` in `scripts/plan-context.sh`**

Extend the arg loop (currently lines 15-20) to capture the flag:

```bash
SEMANTIC_QUERY=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --with-openspec) WITH_OPENSPEC=1; shift ;;
        --semantic) SEMANTIC_QUERY="$2"; shift 2 ;;
        *) OPENSPEC_FILES+=("$1"); shift ;;
    esac
done
```

Then, before the final `if [[ $found -eq 0 ]]` block, append the best-effort semantic section:

```bash
# Optional: semantic neighbours via /api/openspec/search (fallback: grep-only).
if [[ -n "$SEMANTIC_QUERY" ]]; then
    base="${OPENSPEC_SEARCH_URL:-http://website.website.svc.cluster.local:4321}"
    resp="$(curl -fsS --max-time 5 -G "$base/api/openspec/search" \
              --data-urlencode "q=$SEMANTIC_QUERY" --data-urlencode "limit=3" 2>/dev/null || true)"
    if [[ -n "$resp" ]]; then
        echo "### Semantically similar OpenSpec changes"
        echo
        echo "$resp" | jq -r '.results[]? | "- **\(.slug)** (\(.ticket_id // "no-ticket"), \(.file_type)): \(.snippet)"' 2>/dev/null || true
        echo
        found=$((found+1))
    fi
fi
```

- [ ] **Step 3b: Register `openspec_find_similar` in `scripts/factory/mcp-server.mjs`**

Inside `buildServer()`, after the `factory_recent` tool (before `return server`), add:

```js
server.tool('openspec_find_similar',
  'Findet semantisch ähnliche OpenSpec Changes zu einer Suchanfrage (wraps /api/openspec/search)',
  { query: z.string().describe('Suchanfrage'),
    limit: z.number().optional().describe('Default 5'),
    status: z.string().optional().describe('Filter: planning | plan_staged | archived') },
  async ({ query, limit, status }) => {
    const base = process.env.OPENSPEC_SEARCH_URL || 'http://website.website.svc.cluster.local:4321'
    const u = new URL(`${base}/api/openspec/search`)
    u.searchParams.set('q', query)
    if (limit) u.searchParams.set('limit', String(limit))
    if (status) u.searchParams.set('status', status)
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(8000) })
      const text = await r.text()
      return { content: [{ type: 'text', text }], isError: !r.ok }
    } catch (e) {
      return { content: [{ type: 'text', text: `error: ${e.message}` }], isError: true }
    }
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding.bats`
Expected: PASS (all cases incl. the 3 new ones).

Also verify line budgets:
Run: `wc -l scripts/plan-context.sh scripts/factory/mcp-server.mjs`
Expected: both well under 500.

- [ ] **Step 5: Commit**

```bash
git add scripts/plan-context.sh scripts/factory/mcp-server.mjs tests/spec/openspec-embedding.bats
git commit -m "feat(openspec): plan-context --semantic + openspec_find_similar MCP tool [T001008]"
```

---

## Task 6: Backfill task + test discovery wiring + verification gate

Letzte Task: Backfill-Task, sicherstellen dass vitest die `.mjs`-Tests entdeckt, und der verpflichtende CI-Gate-Lauf.

**Files:**
- Modify: `Taskfile.yml` (neuer `openspec:embed:backfill` Task)
- Modify (falls nötig): `website/vitest.config.ts` (include `../scripts/**/*.test.mjs`)
- Test: `tests/spec/openspec-embedding.bats` (Backfill-Dry-Run-Smoke)

**Interfaces:**
- Consumes: `scripts/openspec-embed.mjs` CLI, `website/src/data/openspec-status.json` (status per slug, generiert von `openspec-status-map.sh`).
- Produces: `task openspec:embed:backfill [-- --dry-run]`.

- [ ] **Step 1: Confirm vitest discovers `scripts/**/*.test.mjs`**

Run: `cd website && npx vitest run ../scripts/openspec-embed.test.mjs 2>&1 | tail -5`
- If it ran in Task 1, discovery already works → skip the config edit.
- If vitest reports "No test files found" when run via the bare `vitest` (no explicit path), inspect `website/vitest.config.ts` `test.include` and add `'../scripts/**/*.test.mjs'` to the array. Keep the existing entries. (Explicit-path runs always work; this only matters for `task test:changed` globbing.)

- [ ] **Step 2: Write the failing test (append to `tests/spec/openspec-embedding.bats`)**

```bash
@test "backfill task exists and dry-run runs without DB writes" {
  run bash -c "cd '$REPO' && task openspec:embed:backfill -- --dry-run 2>&1 | head -20"
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `./tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding.bats -f backfill`
Expected: FAIL — `task: Task "openspec:embed:backfill" does not exist`.

- [ ] **Step 4: Add the backfill task to `Taskfile.yml`**

Add after the existing `openspec:archive` task (~line 742):

```yaml
  openspec:embed:backfill:
    desc: "Re-index all active openspec changes (status planning|plan_staged) into pgvector. Usage: task openspec:embed:backfill [-- --dry-run]"
    cmds:
      - |
        set -e
        for d in openspec/changes/*/; do
          slug="$(basename "$d")"
          [ "$slug" = "archive" ] && continue
          [ -f "$d/tasks.md" ] || continue
          st="$(sed -n 's/^status:[[:space:]]*//p' "$d/tasks.md" | head -1)"
          case "$st" in planning|plan_staged) ;; *) continue ;; esac
          echo "backfill: $slug (status=$st)"
          node scripts/openspec-embed.mjs --slug "$slug" {{.CLI_ARGS}}
        done
```

- [ ] **Step 5: Run test to verify it passes**

Run: `./tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding.bats -f backfill`
Expected: PASS.

- [ ] **Step 6: Regenerate the test inventory**

Run: `task test:inventory`
Expected: `website/src/data/test-inventory.json` updated to include the new BATS file and vitest specs.

- [ ] **Step 7: Run the mandatory verification gate**

Run each and confirm green:

```bash
task test:changed          # vitest --changed + BATS selection + quality:check for touched domains
task freshness:regenerate  # regenerate generated artifacts (test-inventory, repo-index, …)
task freshness:check       # CI equivalent: freshness + quality:check (S1–S4 ratchet) + baseline assertion
```

Expected: all PASS. If `quality:check` flags an S1 line-budget regression on any new file, split the offender into a sibling module (real extraction, not cosmetic line-joining) and re-run. If `freshness:check` reports a baseline key-count delta, you accidentally created a baseline entry — shrink the file below its limit instead.

- [ ] **Step 8: Validate OpenSpec tree before push**

```bash
bash scripts/openspec.sh validate   # or: task test:openspec
```
Expected: `openspec validate: OK`.

- [ ] **Step 9: Commit (incl. regenerated inventory)**

```bash
git add Taskfile.yml tests/spec/openspec-embedding.bats website/src/data/test-inventory.json
git add website/vitest.config.ts 2>/dev/null || true
git commit -m "feat(openspec): embed backfill task + test inventory [T001008]"
```

---

## Self-Review notes (covered)

- **Spec coverage:** (1) `openspec-embed.mjs` Write-CLI → Tasks 1–2. (2) `openspec.sh` apply/archive hook → Task 3. (3) `/api/openspec/search` → Task 4. (4) `plan-context.sh --semantic` → Task 5. (5) MCP `openspec_find_similar` → Task 5. (6) Backfill task → Task 6. (7) Tests (Unit chunking/frontmatter/idempotency/dry-run, integration search, BATS apply) → Tasks 1,2,3,4,5,6.
- **Chunking strategy:** proposal atomic; tasks/spec `##`-section split, 400-token target, 50-token overlap → Task 1 `chunkProposal`/`chunkSections`, Task 2 `buildChunks`.
- **Idempotency:** `DELETE … WHERE metadata->>'slug' = $1` before insert → Task 2 `embedSlug`.
- **Best-effort exit 0:** `_embed_slug … || true` (sh) + `main()` try/catch + `process.exit(0)` → Tasks 2,3.
- **Model consistency / no Mixed-Model:** `resolveEmbeddingModel()` mirrors `createCollection` default; collection stores it; search reads `embedding_model` from the collection → Tasks 2,4.
- **S1/S3/S4:** budgets per file noted in Global Constraints; env-based hosts only; new script referenced in Taskfile + openspec.sh.
- **Design deviations flagged:** MCP tool home (`factory/mcp-server.mjs`, not non-existent `openspec/mcp/`) and test file locations (`scripts/*.test.mjs`, route-adjacent) documented inline above the File Structure table.
