---
title: Software-History Implementation Plan
ticket_id: T000364
domains: [db, website, infra, test]
status: active
pr_number: null
---

# Software-History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify every PR in `bachelorprojekt.features` into `{service, area, kind}` events so the running sum is the current software list, and the history shows when each service appeared/disappeared. Admin-only view at `/admin/software-history`.

**Architecture:** New table `bachelorprojekt.software_events` (FK→features). One classifier script (`software-history-classify.mts`) calls a local LLM (LiteLLM→Ollama, falls back to direct Anthropic if `LITELLM_URL` unset and `ANTHROPIC_API_KEY` is set), writes events idempotently. Two SQL views (`v_software_stack`, `v_software_history`). Astro admin page + Svelte component + 2 API routes.

**Tech Stack:** PostgreSQL 16 (`shared-db`), Node/TypeScript (`tsx`), `@anthropic-ai/sdk` (pointed at LiteLLM), Astro 5 + Svelte 5, BATS.

---

## File Structure

**Create:**
- `deploy/tracking/software-history.sql` — schema + views + grants
- `website/src/lib/software-history-classifier.ts` — pure LLM-call function + Zod schema
- `website/src/lib/software-history-db.ts` — DB helpers (listEvents, listStack, upsertEvents, overrideEvent)
- `scripts/software-history-classify.mts` — CLI wrapper (idempotent batch loop)
- `website/src/pages/api/admin/software-history/index.ts` — GET (list + filters)
- `website/src/pages/api/admin/software-history/[id].ts` — PATCH (manual override)
- `website/src/components/admin/SoftwareHistory.svelte` — Stack cards + history table + edit modal
- `website/src/pages/admin/software-history.astro` — admin page wrapper
- `tests/unit/scripts/software-history-classify.bats` — unit test, mocked LLM
- `tests/sql/software-history.sql` — view-behavior SQL fixtures

**Modify:**
- `Taskfile.yml` — add `software-history:classify` and `software-history:psql` targets
- `deploy/tracking/init.sql` — `\i software-history.sql` at bottom (so re-apply pulls the new schema in)

---

## Task 1: Schema migration

**Files:**
- Create: `deploy/tracking/software-history.sql`
- Modify: `deploy/tracking/init.sql` (append `\i software-history.sql`)
- Test: `tests/sql/software-history.sql`

- [ ] **Step 1: Write the SQL fixture test**

Create `tests/sql/software-history.sql`:

```sql
-- Run with: psql -v ON_ERROR_STOP=1 -f tests/sql/software-history.sql
-- Verifies v_software_stack / v_software_history behavior on a clean fixture.
BEGIN;
TRUNCATE bachelorprojekt.software_events CASCADE;
TRUNCATE bachelorprojekt.features CASCADE;

INSERT INTO bachelorprojekt.features (pr_number, title, category, merged_at, status)
VALUES
  (1, 'add mattermost',     'feat', '2025-01-01', 'shipped'),
  (2, 'remove mattermost',  'chore','2025-03-01', 'shipped'),
  (3, 'add nextcloud-talk', 'feat', '2025-03-02', 'shipped'),
  (4, 'unrelated doc fix',  'docs', '2025-04-01', 'shipped');

INSERT INTO bachelorprojekt.software_events (pr_number, service, area, kind, classifier) VALUES
  (1, 'mattermost',     'chat', 'added',      'manual'),
  (2, 'mattermost',     'chat', 'removed',    'manual'),
  (3, 'nextcloud-talk', 'chat', 'added',      'manual'),
  (4, 'docs',           'internal', 'irrelevant', 'manual');

-- Stack must contain nextcloud-talk, NOT mattermost, NOT docs.
DO $$
DECLARE r RECORD;
BEGIN
  IF (SELECT count(*) FROM bachelorprojekt.v_software_stack WHERE service='mattermost') <> 0 THEN
    RAISE EXCEPTION 'mattermost should not appear in v_software_stack';
  END IF;
  IF (SELECT count(*) FROM bachelorprojekt.v_software_stack WHERE service='nextcloud-talk') <> 1 THEN
    RAISE EXCEPTION 'nextcloud-talk should appear exactly once in v_software_stack';
  END IF;
  IF (SELECT count(*) FROM bachelorprojekt.v_software_stack WHERE service='docs') <> 0 THEN
    RAISE EXCEPTION 'irrelevant events must not appear in v_software_stack';
  END IF;
  IF (SELECT count(*) FROM bachelorprojekt.v_software_history) <> 3 THEN
    RAISE EXCEPTION 'v_software_history must hide irrelevant events; expected 3 rows';
  END IF;
END $$;
ROLLBACK;
\echo 'software-history SQL fixture OK'
```

- [ ] **Step 2: Run the test against current DB and verify it fails**

```bash
source scripts/env-resolve.sh dev
kubectl exec -i -n "${WORKSPACE_NAMESPACE:-workspace}" \
  --context "${ENV_CONTEXT:-k3d-mentolder}" \
  deploy/shared-db -- psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 < tests/sql/software-history.sql
```

Expected: FAIL — `relation "bachelorprojekt.software_events" does not exist`.

- [ ] **Step 3: Write the schema migration**

Create `deploy/tracking/software-history.sql`:

```sql
-- Software-history events: one classified record per PR (may be multiple per PR).
CREATE TABLE IF NOT EXISTS bachelorprojekt.software_events (
  id             BIGSERIAL PRIMARY KEY,
  pr_number      INTEGER NOT NULL REFERENCES bachelorprojekt.features(pr_number) ON DELETE CASCADE,
  service        TEXT    NOT NULL,
  area           TEXT    NOT NULL,
  kind           TEXT    NOT NULL CHECK (kind IN ('added','removed','changed','irrelevant')),
  confidence     NUMERIC(3,2) NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  classifier     TEXT    NOT NULL,
  classified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes          TEXT
);

CREATE INDEX IF NOT EXISTS idx_software_events_pr      ON bachelorprojekt.software_events (pr_number);
CREATE INDEX IF NOT EXISTS idx_software_events_service ON bachelorprojekt.software_events (service);
CREATE INDEX IF NOT EXISTS idx_software_events_kind    ON bachelorprojekt.software_events (kind);

CREATE OR REPLACE VIEW bachelorprojekt.v_software_stack AS
WITH last_event AS (
  SELECT DISTINCT ON (service)
    service, area, kind, classified_at, pr_number
  FROM bachelorprojekt.software_events
  WHERE kind <> 'irrelevant'
  ORDER BY service, classified_at DESC, id DESC
)
SELECT service, area, classified_at AS as_of, pr_number AS last_pr
FROM last_event
WHERE kind <> 'removed'
ORDER BY area, service;

CREATE OR REPLACE VIEW bachelorprojekt.v_software_history AS
SELECT
  e.id,
  e.pr_number,
  f.merged_at,
  f.title,
  f.brand,
  f.merged_by,
  e.service,
  e.area,
  e.kind,
  e.confidence,
  e.classifier,
  e.classified_at,
  e.notes
FROM bachelorprojekt.software_events e
JOIN bachelorprojekt.features f ON f.pr_number = e.pr_number
WHERE e.kind <> 'irrelevant'
ORDER BY f.merged_at DESC, e.id DESC;

GRANT SELECT ON bachelorprojekt.software_events,
                bachelorprojekt.v_software_stack,
                bachelorprojekt.v_software_history
  TO website;
GRANT INSERT, UPDATE, DELETE ON bachelorprojekt.software_events TO website;
GRANT USAGE, SELECT ON SEQUENCE bachelorprojekt.software_events_id_seq TO website;
```

Append to `deploy/tracking/init.sql` (last line):

```sql
\i software-history.sql
```

- [ ] **Step 4: Apply schema and re-run fixture test**

```bash
source scripts/env-resolve.sh dev
kubectl exec -i -n "${WORKSPACE_NAMESPACE:-workspace}" \
  --context "${ENV_CONTEXT:-k3d-mentolder}" \
  deploy/shared-db -- psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 < deploy/tracking/software-history.sql

kubectl exec -i -n "${WORKSPACE_NAMESPACE:-workspace}" \
  --context "${ENV_CONTEXT:-k3d-mentolder}" \
  deploy/shared-db -- psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 < tests/sql/software-history.sql
```

Expected: `software-history SQL fixture OK`.

- [ ] **Step 5: Commit**

```bash
git add deploy/tracking/software-history.sql deploy/tracking/init.sql tests/sql/software-history.sql
git commit -m "feat(tracking): add software_events schema + views"
```

---

## Task 2: Classifier library (pure function)

**Files:**
- Create: `website/src/lib/software-history-classifier.ts`
- Test: covered by Task 4 BATS (no Vitest in this repo)

- [ ] **Step 1: Write the classifier module**

Create `website/src/lib/software-history-classifier.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export const CLASSIFIER_VERSION = 'software-history-v1';
export const DEFAULT_MODEL = process.env.SOFTWARE_HISTORY_MODEL ?? 'claude-3-5-sonnet-20241022';

export const Event = z.object({
  service: z.string().min(1).max(64),
  area: z.enum([
    'chat','files','video','office','auth','ai','billing','admin',
    'tracking','board','arena','docs','internal','other',
  ]),
  kind: z.enum(['added','removed','changed','irrelevant']),
  confidence: z.number().min(0).max(1).default(0.8),
  notes: z.string().max(280).optional(),
});
export type Event = z.infer<typeof Event>;

export const Envelope = z.object({ events: z.array(Event).min(1) });

const SYSTEM_PROMPT = `Du klassifizierst einen GitHub-Pull-Request für eine Software-Stack-Historie.

Antworte AUSSCHLIESSLICH mit JSON in dieser Form (kein Markdown):
{"events": [{"service":"...","area":"...","kind":"...","confidence":0.0-1.0,"notes":"..."}]}

Regeln:
- Ein PR kann mehrere Events erzeugen (z.B. "Mattermost entfernt + Native-Chat ergänzt" = 2 Events).
- "service" ist klein-geschrieben, bindestrich-getrennt (z.B. "nextcloud-talk", "livekit", "mattermost", "operator-dashboard").
- "area" muss aus: chat, files, video, office, auth, ai, billing, admin, tracking, board, arena, docs, internal, other.
- "kind":
  - "added"      = neuer Service / neues Tool wird eingeführt
  - "removed"    = Service / Tool wird entfernt oder ersetzt
  - "changed"    = bestehender Service wird substanziell geändert (Update, Refactor, Migration)
  - "irrelevant" = PR betrifft keinen Stack-Bestandteil (Doku, kleinerer Bugfix, Plan-Archiv, Tracking-Drain)
- Wenn unsicher: ein einzelnes Event mit kind="irrelevant", service="unknown", area="other", niedrige confidence.
- "notes" optional, max 280 Zeichen, knappe deutsche Begründung.`;

export interface ClassifyPRInput {
  pr_number: number;
  title: string;
  description: string | null;
}

export interface ClassifyOpts {
  client?: Anthropic;
  model?: string;
}

export async function classifyPR(input: ClassifyPRInput, opts: ClassifyOpts = {}): Promise<Event[]> {
  const baseURL = process.env.LITELLM_URL ?? process.env.ANTHROPIC_BASE_URL;
  const apiKey  = process.env.ANTHROPIC_API_KEY ?? 'sk-local';
  const client  = opts.client ?? new Anthropic({ apiKey, baseURL });
  const model   = opts.model ?? DEFAULT_MODEL;

  const userMsg =
    `PR #${input.pr_number}\nTitel: ${input.title}\n\n` +
    `Body:\n"""\n${(input.description ?? '').slice(0, 6000)}\n"""`;

  const resp = await client.messages.create({
    model,
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('classifier returned no JSON object');
  const parsed = Envelope.parse(JSON.parse(jsonMatch[0]));
  return parsed.events;
}
```

- [ ] **Step 2: Sanity-compile the module**

```bash
cd website && npx tsc --noEmit src/lib/software-history-classifier.ts
```

Expected: no output (clean compile). If `@anthropic-ai/sdk` is missing, it is already in `website/package.json` — verify with `grep anthropic package.json`.

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/software-history-classifier.ts
git commit -m "feat(software-history): classifier module"
```

---

## Task 3: DB helpers

**Files:**
- Create: `website/src/lib/software-history-db.ts`
- Test: exercised in Tasks 5 (CLI) and 7 (API)

- [ ] **Step 1: Write the helpers**

Create `website/src/lib/software-history-db.ts`:

```typescript
import { Pool, type PoolClient } from 'pg';
import type { Event } from './software-history-classifier';

export interface StackRow {
  service: string;
  area: string;
  as_of: string;     // ISO timestamp
  last_pr: number;
}

export interface HistoryRow {
  id: number;
  pr_number: number;
  merged_at: string;
  title: string;
  brand: string | null;
  merged_by: string | null;
  service: string;
  area: string;
  kind: 'added' | 'removed' | 'changed' | 'irrelevant';
  confidence: number;
  classifier: string;
  classified_at: string;
  notes: string | null;
}

export interface ListFilters {
  kind?: string;
  area?: string;
  brand?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function listStack(pool: Pool): Promise<StackRow[]> {
  const { rows } = await pool.query<StackRow>(
    `SELECT service, area, as_of, last_pr FROM bachelorprojekt.v_software_stack`,
  );
  return rows;
}

export async function listHistory(pool: Pool, f: ListFilters = {}): Promise<HistoryRow[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.kind)  { args.push(f.kind);  where.push(`kind = $${args.length}`); }
  if (f.area)  { args.push(f.area);  where.push(`area = $${args.length}`); }
  if (f.brand) { args.push(f.brand); where.push(`(brand = $${args.length} OR brand IS NULL)`); }
  if (f.q)     { args.push(`%${f.q}%`); where.push(`(title ILIKE $${args.length} OR notes ILIKE $${args.length})`); }
  const limit  = Math.max(1, Math.min(f.limit ?? 200, 1000));
  const offset = Math.max(0, f.offset ?? 0);
  args.push(limit); args.push(offset);
  const sql =
    `SELECT id, pr_number, merged_at, title, brand, merged_by,
            service, area, kind, confidence, classifier, classified_at, notes
       FROM bachelorprojekt.v_software_history` +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` LIMIT $${args.length - 1} OFFSET $${args.length}`;
  const { rows } = await pool.query<HistoryRow>(sql, args);
  return rows;
}

/**
 * Insert classified events for a PR. Skips if the PR already has events
 * unless `replaceFailed` is true (then deletes only llm:failed rows first).
 * Manual overrides (classifier='manual') are NEVER touched.
 */
export async function upsertEventsForPR(
  pool: Pool,
  pr_number: number,
  events: Event[],
  classifier: string,
  opts: { replaceFailed?: boolean } = {},
): Promise<{ inserted: number; skipped: boolean }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      `SELECT id, classifier FROM bachelorprojekt.software_events WHERE pr_number = $1`,
      [pr_number],
    );
    const hasManual = existing.some((r) => r.classifier === 'manual');
    if (hasManual) {
      await client.query('ROLLBACK');
      return { inserted: 0, skipped: true };
    }

    if (existing.length > 0) {
      if (!opts.replaceFailed) {
        await client.query('ROLLBACK');
        return { inserted: 0, skipped: true };
      }
      await client.query(
        `DELETE FROM bachelorprojekt.software_events
          WHERE pr_number = $1 AND classifier = 'llm:failed'`,
        [pr_number],
      );
    }

    let inserted = 0;
    for (const e of events) {
      await client.query(
        `INSERT INTO bachelorprojekt.software_events
           (pr_number, service, area, kind, confidence, classifier, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [pr_number, e.service, e.area, e.kind, e.confidence, classifier, e.notes ?? null],
      );
      inserted++;
    }

    await client.query('COMMIT');
    return { inserted, skipped: false };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Promote a single event to manual override. */
export async function overrideEvent(
  pool: Pool,
  id: number,
  patch: { service: string; area: string; kind: string; notes: string | null },
): Promise<HistoryRow | null> {
  const { rows } = await pool.query<HistoryRow>(
    `UPDATE bachelorprojekt.software_events
        SET service = $2, area = $3, kind = $4, notes = $5,
            classifier = 'manual', confidence = 1.0, classified_at = now()
      WHERE id = $1
      RETURNING (SELECT row_to_json(v) FROM bachelorprojekt.v_software_history v WHERE v.id = software_events.id) AS row`,
    [id, patch.service, patch.area, patch.kind, patch.notes],
  );
  const r = rows[0] as unknown as { row: HistoryRow } | undefined;
  return r?.row ?? null;
}

export async function listUnclassifiedPRs(
  pool: Pool,
  limit?: number,
): Promise<Array<{ pr_number: number; title: string; description: string | null }>> {
  const sql =
    `SELECT f.pr_number, f.title, f.description
       FROM bachelorprojekt.features f
      WHERE NOT EXISTS (
        SELECT 1 FROM bachelorprojekt.software_events e WHERE e.pr_number = f.pr_number
      )
      ORDER BY f.merged_at ASC` + (limit ? ` LIMIT ${Math.max(1, limit | 0)}` : '');
  const { rows } = await pool.query(sql);
  return rows;
}
```

- [ ] **Step 2: Sanity-compile**

```bash
cd website && npx tsc --noEmit src/lib/software-history-db.ts
```

Expected: clean compile.

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/software-history-db.ts
git commit -m "feat(software-history): db helpers"
```

---

## Task 4: BATS unit test (mocked LLM)

**Files:**
- Create: `tests/unit/scripts/software-history-classify.bats`
- Create: `tests/unit/fixtures/software-history/mock-anthropic.mjs`

- [ ] **Step 1: Write the mock Anthropic server**

Create `tests/unit/fixtures/software-history/mock-anthropic.mjs`:

```javascript
#!/usr/bin/env node
// Minimal stub: speaks just enough of /v1/messages for the classifier.
// Returns canned JSON keyed on the PR number found in the user message.
import http from 'node:http';

const RESPONSES = {
  1: { events: [{ service: 'mattermost',     area: 'chat', kind: 'added',   confidence: 0.9 }] },
  2: { events: [{ service: 'mattermost',     area: 'chat', kind: 'removed', confidence: 0.9 },
                 { service: 'native-chat',    area: 'chat', kind: 'added',   confidence: 0.9 }] },
  3: { events: [{ service: 'unknown',        area: 'other', kind: 'irrelevant', confidence: 0.3 }] },
};

const port = parseInt(process.env.MOCK_PORT ?? '4001', 10);
http.createServer((req, res) => {
  if (req.url !== '/v1/messages') { res.writeHead(404).end(); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const m = body.match(/PR #(\d+)/);
    const pr = m ? parseInt(m[1], 10) : 0;
    const payload = RESPONSES[pr] ?? { events: [{ service: 'unknown', area: 'other', kind: 'irrelevant', confidence: 0.1 }] };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      id: 'msg_test', type: 'message', role: 'assistant', model: 'mock',
      content: [{ type: 'text', text: JSON.stringify(payload) }],
      stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
    }));
  });
}).listen(port, '127.0.0.1', () => console.error(`mock anthropic on :${port}`));
```

Make executable: `chmod +x tests/unit/fixtures/software-history/mock-anthropic.mjs`.

- [ ] **Step 2: Write the BATS test**

Create `tests/unit/scripts/software-history-classify.bats`:

```bash
#!/usr/bin/env bats
# Unit test for the software-history classifier CLI.
# Uses a tiny ephemeral Postgres (via psql against TEST_PG_URL) + a stub Anthropic endpoint.

setup() {
  if [[ -z "${TEST_PG_URL:-}" ]]; then
    skip "TEST_PG_URL not set — set to a throwaway postgres URL to enable this test"
  fi
  export MOCK_PORT=4173
  export LITELLM_URL="http://127.0.0.1:${MOCK_PORT}"
  export ANTHROPIC_API_KEY="sk-local"
  export TRACKING_DB_URL="$TEST_PG_URL"

  node tests/unit/fixtures/software-history/mock-anthropic.mjs &
  MOCK_PID=$!
  sleep 0.2

  psql "$TEST_PG_URL" -v ON_ERROR_STOP=1 -f deploy/tracking/init.sql >/dev/null
  psql "$TEST_PG_URL" -v ON_ERROR_STOP=1 <<SQL
TRUNCATE bachelorprojekt.software_events CASCADE;
TRUNCATE bachelorprojekt.features CASCADE;
INSERT INTO bachelorprojekt.features (pr_number, title, description, category, merged_at, status) VALUES
  (1, 'feat: add mattermost', 'introduce mattermost', 'feat', '2025-01-01', 'shipped'),
  (2, 'chore: replace mattermost', 'remove mattermost, add native chat', 'chore', '2025-03-01', 'shipped'),
  (3, 'docs: tweak readme', 'wording', 'docs', '2025-04-01', 'shipped');
SQL
}

teardown() {
  [[ -n "${MOCK_PID:-}" ]] && kill "$MOCK_PID" 2>/dev/null || true
}

@test "classifies every unclassified PR exactly once" {
  run bash -c 'cd website && npx tsx ../scripts/software-history-classify.mts'
  [ "$status" -eq 0 ]

  run psql -At "$TEST_PG_URL" -c "SELECT count(*) FROM bachelorprojekt.software_events"
  [ "$output" -eq 4 ]   # 1 + 2 + 1
}

@test "re-run is idempotent" {
  bash -c 'cd website && npx tsx ../scripts/software-history-classify.mts' >/dev/null
  run bash -c 'cd website && npx tsx ../scripts/software-history-classify.mts'
  [ "$status" -eq 0 ]
  run psql -At "$TEST_PG_URL" -c "SELECT count(*) FROM bachelorprojekt.software_events"
  [ "$output" -eq 4 ]
}

@test "manual overrides survive --force re-run" {
  bash -c 'cd website && npx tsx ../scripts/software-history-classify.mts' >/dev/null
  psql "$TEST_PG_URL" -v ON_ERROR_STOP=1 -c \
    "UPDATE bachelorprojekt.software_events SET classifier='manual', service='manually-renamed' WHERE pr_number=1"

  run bash -c 'cd website && npx tsx ../scripts/software-history-classify.mts --retry-failed'
  [ "$status" -eq 0 ]

  run psql -At "$TEST_PG_URL" -c "SELECT service FROM bachelorprojekt.software_events WHERE pr_number=1"
  [ "$output" = "manually-renamed" ]
}

@test "--limit caps work" {
  run bash -c 'cd website && npx tsx ../scripts/software-history-classify.mts --limit=1'
  [ "$status" -eq 0 ]
  run psql -At "$TEST_PG_URL" -c "SELECT count(DISTINCT pr_number) FROM bachelorprojekt.software_events"
  [ "$output" -eq 1 ]
}
```

- [ ] **Step 3: Run the BATS test and verify it fails**

```bash
./tests/unit/bats-core/bin/bats tests/unit/scripts/software-history-classify.bats
```

Expected: FAIL (`software-history-classify.mts` does not exist yet). If `TEST_PG_URL` is unset, the suite is skipped — set it pointing at a throwaway DB (e.g. `postgres://postgres:postgres@localhost:15432/postgres` after a `task workspace:port-forward ENV=mentolder`).

- [ ] **Step 4: Commit**

```bash
git add tests/unit/scripts/software-history-classify.bats tests/unit/fixtures/software-history/mock-anthropic.mjs
git commit -m "test(software-history): bats unit test with mocked anthropic"
```

---

## Task 5: Classifier CLI

**Files:**
- Create: `scripts/software-history-classify.mts`

- [ ] **Step 1: Write the CLI**

Create `scripts/software-history-classify.mts`:

```typescript
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
  const classifier = `llm:${DEFAULT_MODEL.split('-').slice(0, 4).join('-')}`;

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
```

- [ ] **Step 2: Re-run the BATS test**

```bash
./tests/unit/bats-core/bin/bats tests/unit/scripts/software-history-classify.bats
```

Expected: PASS (4 of 4) or SKIP (if `TEST_PG_URL` unset — set it as described in Task 4 Step 3).

- [ ] **Step 3: Wire into Taskfile**

In `Taskfile.yml`, find the `tracking:ingest:local:` block and add directly below it:

```yaml
  software-history:classify:
    desc: 'Classify all unclassified PRs into bachelorprojekt.software_events (requires TRACKING_DB_URL)'
    cmds:
      - cd website && npx tsx ../scripts/software-history-classify.mts {{.CLI_ARGS}}

  software-history:psql:
    desc: 'psql into shared-db with software_events focus'
    cmds:
      - source scripts/env-resolve.sh "{{.ENV}}" && kubectl exec -it -n "${WORKSPACE_NAMESPACE:-workspace}" --context "${ENV_CONTEXT:-k3d-mentolder}" deploy/shared-db -- psql -U postgres -d postgres
```

- [ ] **Step 4: Dry-run smoke against live DB**

```bash
task workspace:port-forward ENV=mentolder &  # background
sleep 2
export TRACKING_DB_URL="postgres://postgres:$(kubectl get secret -n workspace --context mentolder workspace-secrets -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)@127.0.0.1:5432/postgres"
task software-history:classify -- --dry-run --limit=3
```

Expected: 3 JSON lines on stdout, no DB writes.

- [ ] **Step 5: Commit**

```bash
git add scripts/software-history-classify.mts Taskfile.yml
git commit -m "feat(software-history): classifier CLI + task targets"
```

---

## Task 6: Admin API — GET list

**Files:**
- Create: `website/src/pages/api/admin/software-history/index.ts`

- [ ] **Step 1: Write the route**

Create `website/src/pages/api/admin/software-history/index.ts`:

```typescript
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listHistory, listStack } from '../../../../lib/software-history-db';

export const prerender = false;

const pool = new Pool();

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('forbidden', { status: 403 });

  const sp = url.searchParams;
  const filters = {
    kind:   sp.get('kind')   ?? undefined,
    area:   sp.get('area')   ?? undefined,
    brand:  sp.get('brand')  ?? undefined,
    q:      sp.get('q')      ?? undefined,
    limit:  sp.get('limit')  ? parseInt(sp.get('limit')!, 10)  : undefined,
    offset: sp.get('offset') ? parseInt(sp.get('offset')!, 10) : undefined,
  };

  const [stack, events] = await Promise.all([listStack(pool), listHistory(pool, filters)]);
  return new Response(JSON.stringify({ stack, events }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
```

- [ ] **Step 2: Sanity-compile**

```bash
cd website && npx tsc --noEmit src/pages/api/admin/software-history/index.ts
```

Expected: clean compile.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/admin/software-history/index.ts
git commit -m "feat(software-history): admin GET api"
```

---

## Task 7: Admin API — PATCH override

**Files:**
- Create: `website/src/pages/api/admin/software-history/[id].ts`

- [ ] **Step 1: Write the route**

Create `website/src/pages/api/admin/software-history/[id].ts`:

```typescript
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { z } from 'zod';
import { getSession, isAdmin } from '../../../../lib/auth';
import { overrideEvent } from '../../../../lib/software-history-db';

export const prerender = false;

const pool = new Pool();

const PatchBody = z.object({
  service: z.string().min(1).max(64),
  area:    z.string().min(1).max(32),
  kind:    z.enum(['added','removed','changed','irrelevant']),
  notes:   z.string().max(500).nullable().optional(),
});

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('forbidden', { status: 403 });

  const id = parseInt(params.id ?? '', 10);
  if (!Number.isFinite(id) || id <= 0) return new Response('bad id', { status: 400 });

  let body: unknown;
  try { body = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) return new Response(JSON.stringify(parsed.error.flatten()), { status: 400 });

  const row = await overrideEvent(pool, id, {
    service: parsed.data.service,
    area:    parsed.data.area,
    kind:    parsed.data.kind,
    notes:   parsed.data.notes ?? null,
  });
  if (!row) return new Response('not found', { status: 404 });
  return new Response(JSON.stringify(row), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
```

- [ ] **Step 2: Sanity-compile**

```bash
cd website && npx tsc --noEmit src/pages/api/admin/software-history/\[id\].ts
```

Expected: clean compile.

- [ ] **Step 3: Commit**

```bash
git add 'website/src/pages/api/admin/software-history/[id].ts'
git commit -m "feat(software-history): admin PATCH api"
```

---

## Task 8: Svelte UI component

**Files:**
- Create: `website/src/components/admin/SoftwareHistory.svelte`

- [ ] **Step 1: Write the component**

Create `website/src/components/admin/SoftwareHistory.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  interface StackRow { service: string; area: string; as_of: string; last_pr: number; }
  interface HistoryRow {
    id: number; pr_number: number; merged_at: string; title: string;
    brand: string | null; merged_by: string | null;
    service: string; area: string;
    kind: 'added'|'removed'|'changed'|'irrelevant';
    confidence: number; classifier: string; classified_at: string; notes: string | null;
  }

  let stack: StackRow[] = [];
  let events: HistoryRow[] = [];
  let kindFilter = '';
  let areaFilter = '';
  let q = '';
  let editing: HistoryRow | null = null;

  const KIND_BADGE: Record<HistoryRow['kind'], string> = {
    added: '➕', removed: '➖', changed: '✏️', irrelevant: '⊘',
  };

  async function load() {
    const sp = new URLSearchParams();
    if (kindFilter) sp.set('kind', kindFilter);
    if (areaFilter) sp.set('area', areaFilter);
    if (q)          sp.set('q', q);
    const r = await fetch(`/api/admin/software-history?${sp.toString()}`);
    const j = await r.json();
    stack = j.stack; events = j.events;
  }

  onMount(load);

  function startEdit(row: HistoryRow) { editing = { ...row }; }
  function cancelEdit() { editing = null; }

  async function saveEdit() {
    if (!editing) return;
    const r = await fetch(`/api/admin/software-history/${editing.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        service: editing.service, area: editing.area,
        kind: editing.kind, notes: editing.notes,
      }),
    });
    if (!r.ok) { alert(`save failed: ${r.status}`); return; }
    editing = null;
    await load();
  }

  // Group stack by area for the top section.
  $: stackByArea = stack.reduce<Record<string, StackRow[]>>((acc, r) => {
    (acc[r.area] ??= []).push(r); return acc;
  }, {});
</script>

<section class="stack">
  <h2>Heutiger Stack</h2>
  {#each Object.entries(stackByArea) as [area, rows]}
    <article class="area-card">
      <h3>{area}</h3>
      <ul>
        {#each rows as r}
          <li>
            <a href="#event-{r.last_pr}"><code>{r.service}</code></a>
            <small>seit {new Date(r.as_of).toLocaleDateString()}</small>
          </li>
        {/each}
      </ul>
    </article>
  {/each}
</section>

<section class="filters">
  <input type="text" placeholder="Volltext…" bind:value={q} on:input={load} />
  <select bind:value={kindFilter} on:change={load}>
    <option value="">alle Kinds</option>
    <option value="added">added</option>
    <option value="removed">removed</option>
    <option value="changed">changed</option>
  </select>
  <select bind:value={areaFilter} on:change={load}>
    <option value="">alle Areas</option>
    {#each Array.from(new Set(events.map((e) => e.area))).sort() as a}
      <option value={a}>{a}</option>
    {/each}
  </select>
</section>

<section class="history">
  <table>
    <thead>
      <tr><th>Datum</th><th>Kind</th><th>Service</th><th>Area</th><th>PR</th><th>Confidence</th><th>Quelle</th><th>Notes</th><th></th></tr>
    </thead>
    <tbody>
      {#each events as e}
        <tr id="event-{e.pr_number}">
          <td>{new Date(e.merged_at).toLocaleDateString()}</td>
          <td title={e.kind}>{KIND_BADGE[e.kind]} {e.kind}</td>
          <td><code>{e.service}</code></td>
          <td>{e.area}</td>
          <td><a href="https://github.com/Paddione/Bachelorprojekt/pull/{e.pr_number}" target="_blank" rel="noopener">#{e.pr_number}</a> — {e.title}</td>
          <td>{(e.confidence * 100).toFixed(0)}%</td>
          <td><small>{e.classifier}</small></td>
          <td><small>{e.notes ?? ''}</small></td>
          <td><button on:click={() => startEdit(e)}>edit</button></td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>

{#if editing}
  <div class="modal-backdrop" on:click|self={cancelEdit}>
    <form class="modal" on:submit|preventDefault={saveEdit}>
      <h3>PR #{editing.pr_number} — {editing.title}</h3>
      <label>Service <input bind:value={editing.service} /></label>
      <label>Area <input bind:value={editing.area} /></label>
      <label>Kind
        <select bind:value={editing.kind}>
          <option value="added">added</option>
          <option value="removed">removed</option>
          <option value="changed">changed</option>
          <option value="irrelevant">irrelevant</option>
        </select>
      </label>
      <label>Notes <textarea bind:value={editing.notes}></textarea></label>
      <footer>
        <button type="button" on:click={cancelEdit}>cancel</button>
        <button type="submit">save</button>
      </footer>
    </form>
  </div>
{/if}

<style>
  .stack { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 2rem; }
  .area-card { border: 1px solid #ccc; padding: .75rem 1rem; border-radius: .5rem; min-width: 240px; }
  .filters { display: flex; gap: .5rem; margin-bottom: 1rem; }
  table { width: 100%; border-collapse: collapse; font-size: .9rem; }
  th, td { border-bottom: 1px solid #eee; padding: .4rem .5rem; text-align: left; vertical-align: top; }
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: grid; place-items: center; z-index: 100; }
  .modal { background: white; padding: 1.5rem; border-radius: .5rem; min-width: 400px; display: grid; gap: .5rem; }
  .modal label { display: grid; gap: .25rem; }
  .modal footer { display: flex; justify-content: end; gap: .5rem; margin-top: 1rem; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/admin/SoftwareHistory.svelte
git commit -m "feat(software-history): svelte admin component"
```

---

## Task 9: Admin page

**Files:**
- Create: `website/src/pages/admin/software-history.astro`

- [ ] **Step 1: Write the page**

Create `website/src/pages/admin/software-history.astro`:

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import SoftwareHistory from '../../components/admin/SoftwareHistory.svelte';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname + Astro.url.search));
if (!isAdmin(session)) return Astro.redirect('/admin');
---

<AdminLayout title="Software-History">
  <h1>Software-History</h1>
  <p class="lede">Klassifizierte PR-Events: wann ein Service hinzukam, sich änderte oder verschwand.</p>
  <SoftwareHistory client:load />
</AdminLayout>
```

- [ ] **Step 2: Verify dev-server compiles**

```bash
cd website && pnpm dev &
DEV_PID=$!
sleep 5
curl -sf http://127.0.0.1:4321/admin/software-history -o /dev/null
echo "status: $?"
kill $DEV_PID
```

Expected: status 200 (page renders the login redirect HTML for unauth'd, but no 500 / build error). If the dev-server log shows compile errors, fix them.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/admin/software-history.astro
git commit -m "feat(software-history): admin page"
```

---

## Task 10: AdminLayout nav entry (small)

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro` (or wherever the admin nav lives — confirm via `grep -n 'admin/tickets' website/src/layouts/AdminLayout.astro`)

- [ ] **Step 1: Locate the existing nav and add an entry**

```bash
grep -n 'admin/tickets\|admin/bugs' website/src/layouts/AdminLayout.astro
```

Add a new `<a>` next to the existing admin links:

```astro
<a href="/admin/software-history">Software-History</a>
```

- [ ] **Step 2: Verify nav shows up locally**

```bash
cd website && pnpm dev &
DEV_PID=$!
sleep 5
curl -s http://127.0.0.1:4321/admin/tickets | grep -c 'Software-History'
kill $DEV_PID
```

Expected: `1` (the new link is rendered).

- [ ] **Step 3: Commit**

```bash
git add website/src/layouts/AdminLayout.astro
git commit -m "feat(software-history): nav entry"
```

---

## Task 11: Apply schema in prod + first backfill run

**Files:** none (operational)

- [ ] **Step 1: Apply schema on both prod clusters**

```bash
for CTX in mentolder korczewski; do
  kubectl exec -i -n "$(if [[ $CTX == korczewski ]]; then echo workspace-korczewski; else echo workspace; fi)" \
    --context "$CTX" deploy/shared-db -- psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 < deploy/tracking/software-history.sql
done
```

Expected: `CREATE TABLE` / `CREATE VIEW` / `GRANT` lines, no error.

- [ ] **Step 2: Smoke (dry-run) against mentolder**

```bash
task workspace:port-forward ENV=mentolder &
sleep 2
export TRACKING_DB_URL="postgres://postgres:$(kubectl get secret -n workspace --context mentolder workspace-secrets -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)@127.0.0.1:5432/postgres"
task software-history:classify -- --dry-run --limit=5
```

Expected: 5 JSON lines, no errors. Eyeball that the events look reasonable.

- [ ] **Step 3: Full backfill against mentolder**

Re-uses the port-forward + env var from Step 2.

```bash
task software-history:classify
```

Expected: runs through all ~730 PRs in ~2–4h (RTX 5070 Ti via LiteLLM). Background-friendly — use `nohup` or `screen` if needed.

- [ ] **Step 4: Spot-check via psql**

```bash
task software-history:psql ENV=mentolder
```

Inside psql:

```sql
SELECT count(*) FROM bachelorprojekt.software_events;
SELECT * FROM bachelorprojekt.v_software_stack;
SELECT service, kind, count(*) FROM bachelorprojekt.software_events GROUP BY 1, 2 ORDER BY 1;
```

Expected: `count` ≈ #PRs (likely 1.0–1.3× due to multi-event PRs). Stack lists today's actual services (nextcloud, livekit, keycloak, brett, …). No `mattermost` / `invoiceninja` / `operator-dashboard` in the stack.

- [ ] **Step 5: Backfill korczewski**

Switch port-forward + secret to korczewski and re-run `task software-history:classify`. Alternatively, since classification is brand-agnostic, dump and restore:

```bash
kubectl exec -n workspace --context mentolder deploy/shared-db -- \
  pg_dump -U postgres -d postgres -t bachelorprojekt.software_events --data-only \
  | kubectl exec -i -n workspace-korczewski --context korczewski deploy/shared-db -- \
  psql -U postgres -d postgres
```

Pick whichever fits — both end at the same state.

- [ ] **Step 6: Commit any operational notes**

If you found tuning that should live in the repo (e.g. a useful `seed-overrides.sql`), add it; otherwise skip.

```bash
git status   # likely no changes — skip the commit
```

---

## Task 12: PR

**Files:** none

- [ ] **Step 1: Run the offline test suite**

```bash
task test:all
```

Expected: green. If the new BATS test is skipped because `TEST_PG_URL` was unset, that's fine.

- [ ] **Step 2: Push branch (rename to canonical name first)**

```bash
git push -u origin HEAD:feature/software-history
```

- [ ] **Step 3: Open PR**

```bash
gh pr create --title "feat(software-history): classify PRs into stack-evolution events" \
  --body "$(cat <<'EOF'
## Summary

- New `bachelorprojekt.software_events` table + `v_software_stack` / `v_software_history` views
- `scripts/software-history-classify.mts` classifies each PR via the local LLM path (LiteLLM → Ollama) into `{service, area, kind}` events; idempotent, never overwrites manual rows
- Admin-only `/admin/software-history` page with stack overview, full history table, and inline override editor

## Test plan

- [ ] `task test:all` green
- [ ] `tests/sql/software-history.sql` passes against a clean shared-db
- [ ] BATS test green when `TEST_PG_URL` is set
- [ ] `task software-history:classify -- --dry-run --limit=5` returns reasonable JSON on mentolder
- [ ] `/admin/software-history` renders stack + history after backfill; edit modal persists

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Auto-merge after CI**

Per memory `feedback_pr_workflow` — merge as soon as CI is green.

---

## Self-Review Notes

- Every spec section is covered: schema (Task 1), classifier lib (Task 2), DB helpers (Task 3), tests (Task 4), CLI (Task 5), API (Tasks 6–7), UI (Tasks 8–9), nav (Task 10), backfill (Task 11), PR (Task 12).
- Identifier consistency check: `software_events`, `v_software_stack`, `v_software_history`, `classifyPR`, `upsertEventsForPR`, `overrideEvent`, `listUnclassifiedPRs`, `listStack`, `listHistory`, `CLASSIFIER_VERSION`, `DEFAULT_MODEL` — all referenced names exist in their defining task.
- `software-history-classify.mts` lives in `scripts/` but imports relative paths into `website/src/lib/...`; the Taskfile target runs from `cd website` so relative imports resolve.
- BATS test gracefully skips when `TEST_PG_URL` is unset — CI stays green even without a Postgres service container.
- Manual overrides protection: `upsertEventsForPR` checks for any `classifier='manual'` and aborts the transaction; `--retry-failed` only deletes `classifier='llm:failed'` rows. Test enforces this.
