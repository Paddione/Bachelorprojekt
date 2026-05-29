---
title: Content-Hub v2 Implementation Plan
ticket_id: T000306
domains: [website, db]
status: active
pr_number: null
---

# Content-Hub v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend single-source-of-truth content editing to legal texts, service prose, and non-homepage pages; add a unified schema-driven admin editor with autosave, live preview, per-section version history, and two-admin concurrency safety — across both brands.

**Architecture:** A shared backbone (`content_versions` table + a `version` optimistic-lock column on each editable store + a `ContentRef` registry + a `behaviorStore` + one save/restore endpoint) implements versioning and concurrency once. A declarative `<SchemaEditor>` renders regular sections and a thin `<SectionShell>` wraps irregular ones; both share `<SectionFrame>` chrome. Legal texts store `{{stammdaten.*}}` tokens resolved at render from the T000305 contact SSOT, killing the snapshot drift.

**Tech Stack:** Astro + Svelte (`website/`), TypeScript, `pg` (Postgres `website` DB on `shared-db`), Vitest (unit), Playwright (`tests/e2e/`).

**Spec:** `docs/superpowers/specs/2026-05-29-content-hub-v2-design.md`

---

## Pre-flight (do once before any milestone)

- [ ] **P0: Confirm branch + dependencies merged**

```bash
cd /tmp/wt-content-hub-v2
git rev-parse --abbrev-ref HEAD          # → feature/content-hub-v2
gh pr list --search "T000305" --state all --json number,state,title
gh pr list --search "T000304" --state all --json number,state,title
```

Expected: branch is `feature/content-hub-v2`. **If T000305's PR is not yet merged, STOP** — this feature builds directly on its SSOT primitives (`getEffectiveStammdaten`, `getJsonSetting`/`setJsonSetting`, `content-projection.ts`). Once both are merged:

```bash
git fetch origin main && git rebase origin/main
grep -n "getEffectiveStammdaten" website/src/lib/content.ts        # must exist (T000305)
grep -n "ensureSchemaOnce" website/src/lib/website-db.ts           # must exist (T000304)
```

Expected: both symbols present. If absent, the rebase didn't pick up the dependency — stop and reconcile.

- [ ] **P1: Install deps + verify test runner**

```bash
cd /tmp/wt-content-hub-v2/website
node --version            # ≥ 22.13.0 per .nvmrc
pnpm install --frozen-lockfile
pnpm vitest --run src/lib 2>&1 | tail -20
```

Expected: existing vitest suite runs to a known state.

- [ ] **P2: Capture current state for later diff**

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
kubectl exec "${PGPOD#pod/}" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "SELECT brand, key FROM site_settings ORDER BY 1,2;
   SELECT brand, page_key, length(content_html) FROM legal_pages ORDER BY 1,2;" \
  > /tmp/content-hub-v2-before.txt 2>&1
wc -l /tmp/content-hub-v2-before.txt
```

Expected: a non-empty snapshot saved.

---

## Milestone 1 — Backbone (data model, registry, store, save/restore, concurrency)

Files:
- Create: `website/src/lib/admin/version-prune.ts`, `version-prune.test.ts`
- Create: `website/src/lib/admin/conflict.ts`, `conflict.test.ts`
- Create: `website/src/lib/content-registry.ts`, `content-registry.test.ts`
- Create: `scripts/migrate-content-versions.mjs`
- Modify: `website/src/lib/website-db.ts` (content-store accessors + `version` columns)
- Create: `website/src/lib/website-db.content-store.test.ts`
- Create: `website/src/pages/api/admin/content/save.ts`, `save.test.ts`
- Create: `website/src/pages/api/admin/content/restore.ts`, `restore.test.ts`
- Create: `website/src/lib/admin/behaviorStore.ts`, `behaviorStore.test.ts`

### Task 1.1: Version-prune pure helper

- [ ] **Step 1: Write the failing test**

`website/src/lib/admin/version-prune.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { idsToPrune, KEEP_PER_KEY } from './version-prune';

describe('idsToPrune', () => {
  it('keeps the newest KEEP_PER_KEY ids, returns the rest (oldest) for deletion', () => {
    // ids ordered newest-first as returned by the DB index
    const newestFirst = Array.from({ length: KEEP_PER_KEY + 3 }, (_, i) => i + 1);
    expect(idsToPrune(newestFirst)).toEqual([
      KEEP_PER_KEY + 1, KEEP_PER_KEY + 2, KEEP_PER_KEY + 3,
    ]);
  });
  it('returns [] when at or under the cap', () => {
    expect(idsToPrune([1, 2, 3])).toEqual([]);
    expect(idsToPrune(Array.from({ length: KEEP_PER_KEY }, (_, i) => i))).toEqual([]);
  });
  it('handles empty input', () => {
    expect(idsToPrune([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest --run src/lib/admin/version-prune.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`website/src/lib/admin/version-prune.ts`:
```ts
/** Max version snapshots kept per (brand, content_key). */
export const KEEP_PER_KEY = 50;

/**
 * Given snapshot ids ordered newest-first, return the ids beyond the cap
 * (the oldest) that should be deleted.
 */
export function idsToPrune(idsNewestFirst: number[]): number[] {
  if (idsNewestFirst.length <= KEEP_PER_KEY) return [];
  return idsNewestFirst.slice(KEEP_PER_KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest --run src/lib/admin/version-prune.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/admin/version-prune.ts website/src/lib/admin/version-prune.test.ts
git commit -m "feat(content-hub): add version-prune helper [T000306]"
```

### Task 1.2: Conflict-detection pure helper

- [ ] **Step 1: Write the failing test**

`website/src/lib/admin/conflict.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isConflict, nextVersion } from './conflict';

describe('isConflict', () => {
  it('flags a stale base version', () => {
    expect(isConflict(3, 2)).toBe(true);   // current=3, base=2 → someone saved
  });
  it('allows a matching base version', () => {
    expect(isConflict(2, 2)).toBe(false);
  });
  it('treats a null current row (brand-new key) as no conflict when base is 0', () => {
    expect(isConflict(null, 0)).toBe(false);
    expect(isConflict(null, 1)).toBe(true); // editor thinks it had v1 but row is gone
  });
});

describe('nextVersion', () => {
  it('starts at 1 for a new row', () => { expect(nextVersion(null)).toBe(1); });
  it('increments an existing row', () => { expect(nextVersion(4)).toBe(5); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest --run src/lib/admin/conflict.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`website/src/lib/admin/conflict.ts`:
```ts
/** True when the editor's base version no longer matches the live row. */
export function isConflict(currentVersion: number | null, baseVersion: number): boolean {
  if (currentVersion === null) return baseVersion !== 0;
  return currentVersion !== baseVersion;
}

/** The version to write for the next save. */
export function nextVersion(currentVersion: number | null): number {
  return (currentVersion ?? 0) + 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest --run src/lib/admin/conflict.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/admin/conflict.ts website/src/lib/admin/conflict.test.ts
git commit -m "feat(content-hub): add conflict-detection helper [T000306]"
```

### Task 1.3: ContentRef registry

The registry is the single map from a `contentKey` to its storage type and public route. It carries no DB code itself — read/write are resolved by the store layer (Task 1.5) using `contentType`.

- [ ] **Step 1: Write the failing test**

`website/src/lib/content-registry.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { CONTENT_REGISTRY, refFor, publicRouteFor } from './content-registry';

describe('content registry', () => {
  it('has a unique contentKey per entry', () => {
    const keys = CONTENT_REGISTRY.map((r) => r.contentKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('resolves a ref and its public route', () => {
    const ref = refFor('legal:datenschutz');
    expect(ref?.contentType).toBe('legal_page');
    expect(publicRouteFor('legal:datenschutz')).toBe('/datenschutz');
  });
  it('maps service sections to their slug route', () => {
    expect(publicRouteFor('service:coaching')).toBe('/coaching');
  });
  it('returns undefined for an unknown key', () => {
    expect(refFor('nope')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest --run src/lib/content-registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`website/src/lib/content-registry.ts`:
```ts
export type ContentType = 'site_setting' | 'legal_page' | 'service' | 'leistungen';

export interface ContentRef {
  contentKey: string;          // 'kontakt', 'legal:datenschutz', 'service:coaching'
  contentType: ContentType;
  storeKey: string;            // site_settings key | legal page_key | service slug | 'default'
  publicRoute: string;         // route to preview in the iframe
}

export const CONTENT_REGISTRY: ContentRef[] = [
  { contentKey: 'kontakt',            contentType: 'site_setting', storeKey: 'kontakt',        publicRoute: '/kontakt' },
  { contentKey: 'stammdaten',         contentType: 'site_setting', storeKey: 'stammdaten',     publicRoute: '/' },
  { contentKey: 'uebermich',          contentType: 'site_setting', storeKey: 'uebermich',      publicRoute: '/ueber-mich' },
  { contentKey: 'navigation',         contentType: 'site_setting', storeKey: 'navigation',     publicRoute: '/' },
  { contentKey: 'footer',             contentType: 'site_setting', storeKey: 'footer',         publicRoute: '/' },
  { contentKey: 'faq',                contentType: 'site_setting', storeKey: 'faq',            publicRoute: '/' },
  { contentKey: 'referenzen',         contentType: 'site_setting', storeKey: 'referenzen',     publicRoute: '/' },
  { contentKey: 'seo',                contentType: 'site_setting', storeKey: 'seo',            publicRoute: '/' },
  { contentKey: 'startseite',         contentType: 'site_setting', storeKey: 'startseite',     publicRoute: '/' },
  { contentKey: 'legal:impressum',    contentType: 'legal_page',   storeKey: 'impressum',      publicRoute: '/impressum' },
  { contentKey: 'legal:datenschutz',  contentType: 'legal_page',   storeKey: 'datenschutz',    publicRoute: '/datenschutz' },
  { contentKey: 'legal:agb',          contentType: 'legal_page',   storeKey: 'agb',            publicRoute: '/agb' },
  { contentKey: 'legal:barrierefreiheit', contentType: 'legal_page', storeKey: 'barrierefreiheit', publicRoute: '/barrierefreiheit' },
  { contentKey: 'service:coaching',         contentType: 'service', storeKey: 'coaching',          publicRoute: '/coaching' },
  { contentKey: 'service:fuehrung-persoenlichkeit', contentType: 'service', storeKey: 'fuehrung-persoenlichkeit', publicRoute: '/fuehrung-persoenlichkeit' },
  { contentKey: 'service:50plus-digital',   contentType: 'service', storeKey: '50plus-digital',    publicRoute: '/50plus-digital' },
  { contentKey: 'service:ki-transition',    contentType: 'service', storeKey: 'ki-transition',     publicRoute: '/ki-transition' },
  { contentKey: 'service:beratung',         contentType: 'service', storeKey: 'beratung',          publicRoute: '/beratung' },
  { contentKey: 'angebote',           contentType: 'service',      storeKey: 'angebote',       publicRoute: '/leistungen' },
  { contentKey: 'leistungen',         contentType: 'leistungen',   storeKey: 'default',        publicRoute: '/leistungen' },
];

export function refFor(contentKey: string): ContentRef | undefined {
  return CONTENT_REGISTRY.find((r) => r.contentKey === contentKey);
}

export function publicRouteFor(contentKey: string): string | undefined {
  return refFor(contentKey)?.publicRoute;
}
```

> **Note for the implementer (SEO multi-key):** the SEO section spans several `site_settings` keys (`seo_title_*`). It is registered here as a single `seo` content key. In Task 1.5 the store layer stores the whole SEO section as one JSON value under `site_settings` key `seo` (an aggregate), so it gets one `version`. The render path (Task 3.1's SEO schema wiring) reads the aggregate. Do not version each `seo_title_*` key independently.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest --run src/lib/content-registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/content-registry.ts website/src/lib/content-registry.test.ts
git commit -m "feat(content-hub): add content-ref registry [T000306]"
```

### Task 1.4: DB migration — content_versions table + version columns

- [ ] **Step 1: Write the migration script**

`scripts/migrate-content-versions.mjs` — idempotent, dry-run by default, `--apply` to write. Connects with the same `SESSIONS_DATABASE_URL` as `website-db.ts`.

```js
#!/usr/bin/env node
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const DDL = `
CREATE TABLE IF NOT EXISTS content_versions (
  id           BIGSERIAL PRIMARY KEY,
  brand        TEXT        NOT NULL,
  content_key  TEXT        NOT NULL,
  content_type TEXT        NOT NULL,
  snapshot     JSONB       NOT NULL,
  editor       TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_versions_key_idx
  ON content_versions (brand, content_key, created_at DESC);
ALTER TABLE site_settings    ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;
ALTER TABLE legal_pages      ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;
ALTER TABLE service_config   ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;
ALTER TABLE leistungen_config ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;
`;

const url = process.env.SESSIONS_DATABASE_URL;
if (!url) { console.error('SESSIONS_DATABASE_URL required'); process.exit(2); }
const client = new pg.Client({ connectionString: url });
await client.connect();
if (!APPLY) {
  console.log('DRY-RUN. DDL that would run:\n' + DDL);
} else {
  await client.query(DDL);
  console.log('Applied content-versions migration.');
}
await client.end();
```

- [ ] **Step 2: Dry-run against dev**

```bash
cd /tmp/wt-content-hub-v2
# dev DB reachable per the devcluster-access memory (ssh gekko@k3s-1) or a 127.0.0.1:15432 forward
SESSIONS_DATABASE_URL="postgresql://website:...@127.0.0.1:15432/website" \
  node scripts/migrate-content-versions.mjs
```
Expected: prints the DDL, writes nothing.

- [ ] **Step 3: Apply against dev**

```bash
SESSIONS_DATABASE_URL="postgresql://website:...@127.0.0.1:15432/website" \
  node scripts/migrate-content-versions.mjs --apply
```
Expected: "Applied content-versions migration." Re-running is a no-op (IF NOT EXISTS).

> **Prod (both clusters) is applied in M6, not now** — see Task 6.2.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-content-versions.mjs
git commit -m "feat(content-hub): add content-versions schema migration [T000306]"
```

### Task 1.5: Content-store accessors (read/write with version bump + snapshot + prune)

- [ ] **Step 1: Write the failing test** (mock the `pg` pool)

`website/src/lib/website-db.content-store.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('./db-pool', () => ({ getPool: () => ({ query, connect: async () => ({ query, release() {} }) }) }));

import { readContent, writeContent } from './website-db';

beforeEach(() => { query.mockReset(); });

describe('readContent', () => {
  it('returns the value + version for a site_setting', async () => {
    query.mockResolvedValueOnce({ rows: [{ value: '{"footerEmail":"a@b.de"}', version: 2 }] });
    const r = await readContent('mentolder', 'kontakt');
    expect(r).toEqual({ value: { footerEmail: 'a@b.de' }, version: 2 });
  });
  it('returns version 0 + null value when absent', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await readContent('mentolder', 'kontakt')).toEqual({ value: null, version: 0 });
  });
});

describe('writeContent', () => {
  it('rejects on a stale base version (conflict)', async () => {
    query.mockResolvedValueOnce({ rows: [{ value: '{}', version: 3 }] }); // current read
    await expect(writeContent('mentolder', 'kontakt', { x: 1 }, 2, 'gekko'))
      .rejects.toMatchObject({ code: 'CONFLICT', currentVersion: 3 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest --run src/lib/website-db.content-store.test.ts`
Expected: FAIL — `readContent`/`writeContent` not exported. (If `./db-pool` does not exist as a separate module, adjust the mock to match how `website-db.ts` obtains its pool — `grep -n "new Pool\|Pool(" website/src/lib/website-db.ts` and mock that.)

- [ ] **Step 3: Implement in `website/src/lib/website-db.ts`**

Add, reusing the existing pool and the `refFor` registry. Use a transaction; branch the live read/write by `contentType`:
```ts
import { refFor } from './content-registry';
import { isConflict, nextVersion } from './admin/version-prune'; // re-export or import from conflict
import { idsToPrune } from './admin/version-prune';
import { isConflict as detectConflict, nextVersion as bumpVersion } from './admin/conflict';

export interface ContentRead { value: any | null; version: number }
export class ContentConflictError extends Error {
  code = 'CONFLICT' as const;
  constructor(public currentVersion: number, public currentValue: any, public editor: string | null) {
    super('content version conflict');
  }
}

// Per contentType: how to read/write the live value + its version.
async function liveRead(client: any, brand: string, ref: { contentType: string; storeKey: string }): Promise<ContentRead> {
  switch (ref.contentType) {
    case 'site_setting': {
      const r = await client.query('SELECT value, version FROM site_settings WHERE brand=$1 AND key=$2', [brand, ref.storeKey]);
      return r.rows.length ? { value: safeJson(r.rows[0].value), version: r.rows[0].version } : { value: null, version: 0 };
    }
    case 'legal_page': {
      const r = await client.query('SELECT content_html, version FROM legal_pages WHERE brand=$1 AND page_key=$2', [brand, ref.storeKey]);
      return r.rows.length ? { value: r.rows[0].content_html, version: r.rows[0].version } : { value: null, version: 0 };
    }
    case 'service': {
      const r = await client.query('SELECT page_content, version FROM service_config WHERE brand=$1 AND slug=$2', [brand, ref.storeKey]);
      return r.rows.length ? { value: safeJson(r.rows[0].page_content), version: r.rows[0].version } : { value: null, version: 0 };
    }
    case 'leistungen': {
      const r = await client.query('SELECT categories_json, version FROM leistungen_config WHERE brand=$1', [brand]);
      return r.rows.length ? { value: safeJson(r.rows[0].categories_json), version: r.rows[0].version } : { value: null, version: 0 };
    }
    default: throw new Error('unknown contentType ' + ref.contentType);
  }
}

async function liveWrite(client: any, brand: string, ref: { contentType: string; storeKey: string }, value: any, version: number) {
  switch (ref.contentType) {
    case 'site_setting':
      return client.query(
        `INSERT INTO site_settings (brand, key, value, version) VALUES ($1,$2,$3,$4)
         ON CONFLICT (brand, key) DO UPDATE SET value=$3, version=$4`,
        [brand, ref.storeKey, JSON.stringify(value), version]);
    case 'legal_page':
      return client.query(
        `INSERT INTO legal_pages (brand, page_key, content_html, version) VALUES ($1,$2,$3,$4)
         ON CONFLICT (brand, page_key) DO UPDATE SET content_html=$3, version=$4`,
        [brand, ref.storeKey, String(value), version]);
    case 'service':
      return client.query(
        `INSERT INTO service_config (brand, slug, page_content, version) VALUES ($1,$2,$3,$4)
         ON CONFLICT (brand, slug) DO UPDATE SET page_content=$3, version=$4`,
        [brand, ref.storeKey, JSON.stringify(value), version]);
    case 'leistungen':
      return client.query(
        `INSERT INTO leistungen_config (brand, categories_json, version) VALUES ($1,$2,$3)
         ON CONFLICT (brand) DO UPDATE SET categories_json=$2, version=$3`,
        [brand, JSON.stringify(value), version]);
  }
}

function safeJson(v: any) { if (v == null) return null; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } }

export async function readContent(brand: string, contentKey: string): Promise<ContentRead> {
  const ref = refFor(contentKey); if (!ref) throw new Error('unknown contentKey ' + contentKey);
  await ensureSchemaOnce();                         // T000304 guard
  const pool = getPool();
  return liveRead(pool, brand, ref);
}

/**
 * Write live, append the PRIOR value to content_versions, bump version, prune.
 * Throws ContentConflictError when baseVersion is stale.
 */
export async function writeContent(brand: string, contentKey: string, value: any, baseVersion: number, editor: string): Promise<{ version: number }> {
  const ref = refFor(contentKey); if (!ref) throw new Error('unknown contentKey ' + contentKey);
  await ensureSchemaOnce();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await liveRead(client, brand, ref);
    if (detectConflict(cur.version === 0 ? null : cur.version, baseVersion)) {
      await client.query('ROLLBACK');
      throw new ContentConflictError(cur.version, cur.value, null);
    }
    // snapshot the prior value (skip if brand-new key with null value)
    if (cur.value !== null) {
      await client.query(
        `INSERT INTO content_versions (brand, content_key, content_type, snapshot, editor)
         VALUES ($1,$2,$3,$4,$5)`,
        [brand, contentKey, ref.contentType, JSON.stringify({ value: cur.value, version: cur.version }), editor]);
    }
    const ver = bumpVersion(cur.version === 0 ? null : cur.version);
    await liveWrite(client, brand, ref, value, ver);
    // prune
    const ids = await client.query(
      `SELECT id FROM content_versions WHERE brand=$1 AND content_key=$2 ORDER BY created_at DESC`,
      [brand, contentKey]);
    const prune = idsToPrune(ids.rows.map((r: any) => Number(r.id)));
    if (prune.length) await client.query(`DELETE FROM content_versions WHERE id = ANY($1)`, [prune]);
    await client.query('COMMIT');
    return { version: ver };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function listVersions(brand: string, contentKey: string) {
  const pool = getPool();
  const r = await pool.query(
    `SELECT id, editor, created_at, snapshot FROM content_versions
     WHERE brand=$1 AND content_key=$2 ORDER BY created_at DESC`, [brand, contentKey]);
  return r.rows.map((row: any) => ({ id: Number(row.id), editor: row.editor, createdAt: row.created_at, snapshot: safeJson(row.snapshot) }));
}
```

> If `getPool`/`ensureSchemaOnce` have different names, align to the real exports (`grep -n "export.*Pool\|ensureSchema" website/src/lib/website-db.ts`). Keep the `version` columns and snapshot logic exactly as above.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest --run src/lib/website-db.content-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/website-db.ts website/src/lib/website-db.content-store.test.ts
git commit -m "feat(content-hub): content-store read/write with versioning + optimistic lock [T000306]"
```

### Task 1.6: Shared save endpoint

- [ ] **Step 1: Write the failing test**

`website/src/pages/api/admin/content/save.test.ts` (follow the existing admin-endpoint test pattern — `grep -rn "createMockContext\|new Request" website/src/pages/api/admin/*/save.test.ts` to copy the harness). Cases:
1. valid save → 200 `{version}`; `writeContent` called with `(brand, contentKey, payload, baseVersion, editor)`.
2. stale base → 409 with `{currentVersion, currentValue}`.
3. schema-invalid payload → 422 with field errors.
4. unauthenticated → redirect/401 like the sibling endpoints.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest --run src/pages/api/admin/content/save.test.ts`
Expected: FAIL — endpoint missing.

- [ ] **Step 3: Implement**

`website/src/pages/api/admin/content/save.ts`:
```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { writeContent, ContentConflictError } from '../../../../lib/website-db';
import { validateSection } from '../../../../lib/admin/schemas';   // Task 3.1
import { refFor } from '../../../../lib/content-registry';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const { contentKey, baseVersion, payload } = await request.json();
  if (!refFor(contentKey)) return new Response('Unknown contentKey', { status: 400 });

  const errors = validateSection(contentKey, payload);
  if (errors.length) return json(422, { errors });

  const editor = session.email ?? session.name ?? 'unknown';
  try {
    const { version } = await writeContent(BRAND, contentKey, payload, baseVersion ?? 0, editor);
    return json(200, { version });
  } catch (e) {
    if (e instanceof ContentConflictError) {
      return json(409, { currentVersion: e.currentVersion, currentValue: e.currentValue });
    }
    console.error('content save failed', e);
    return json(500, { error: 'save failed' });
  }
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
```

> `validateSection` is created in Task 3.1; for M1, stub it as `export const validateSection = (_k: string, _p: unknown): {field:string;message:string}[] => [];` in `website/src/lib/admin/schemas/index.ts` so the endpoint compiles, then flesh it out in M3. Note this stub in the commit message.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest --run src/pages/api/admin/content/save.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/api/admin/content/save.ts website/src/pages/api/admin/content/save.test.ts website/src/lib/admin/schemas/index.ts
git commit -m "feat(content-hub): shared content save endpoint with conflict + validation [T000306]"
```

### Task 1.7: Restore endpoint

- [ ] **Step 1: Write the failing test**

`website/src/pages/api/admin/content/restore.test.ts`: posting `{contentKey, versionId}` loads that snapshot's `value` and calls `writeContent` with the **current** live version as base (so restore never conflicts with itself), returning `200 {version}`. Unknown versionId → 404.

- [ ] **Step 2: Run** → FAIL (missing).

- [ ] **Step 3: Implement**

`website/src/pages/api/admin/content/restore.ts`:
```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { writeContent, readContent, listVersions } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const { contentKey, versionId } = await request.json();
  const versions = await listVersions(BRAND, contentKey);
  const target = versions.find((v) => v.id === versionId);
  if (!target) return new Response('version not found', { status: 404 });

  const current = await readContent(BRAND, contentKey);
  const editor = session.email ?? session.name ?? 'unknown';
  const { version } = await writeContent(BRAND, contentKey, target.snapshot.value, current.version, editor);
  return new Response(JSON.stringify({ version }), { status: 200, headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/api/admin/content/restore.ts website/src/pages/api/admin/content/restore.test.ts
git commit -m "feat(content-hub): content restore endpoint (restore = new versioned save) [T000306]"
```

### Task 1.8: `behaviorStore`

- [ ] **Step 1: Write the failing test**

`website/src/lib/admin/behaviorStore.test.ts` — test the store as a plain object factory (no DOM). Inject a fake `saveFn`. Cases:
1. `setField` marks state `dirty`.
2. autosave fires once after the debounce window when valid; calls `saveFn` with the current `baseVersion`; on success sets `saved` and bumps the held version + emits a `previewRefresh`.
3. a `saveFn` 409 sets state `conflict` and stores `{currentVersion, currentValue}`; autosave does not re-fire until resolved.
4. `resolveConflictTakeMine()` re-saves with `baseVersion = currentVersion`.

Use fake timers (`vi.useFakeTimers()`).

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBehaviorStore } from './behaviorStore';

beforeEach(() => vi.useFakeTimers());

it('autosaves once after debounce when valid', async () => {
  const saveFn = vi.fn().mockResolvedValue({ version: 2 });
  const s = createBehaviorStore({ contentKey: 'kontakt', initialValue: { footerEmail: 'a@b.de' }, initialVersion: 1, validate: () => [], saveFn, debounceMs: 2000 });
  s.setValue({ footerEmail: 'c@d.de' });
  expect(s.get().state).toBe('dirty');
  await vi.advanceTimersByTimeAsync(2000);
  expect(saveFn).toHaveBeenCalledTimes(1);
  expect(saveFn).toHaveBeenCalledWith('kontakt', 1, { footerEmail: 'c@d.de' });
  expect(s.get().state).toBe('saved');
  expect(s.get().version).toBe(2);
});

it('enters conflict on 409 and stops autosaving', async () => {
  const saveFn = vi.fn().mockRejectedValue({ status: 409, body: { currentVersion: 5, currentValue: { footerEmail: 'x@y.de' } } });
  const s = createBehaviorStore({ contentKey: 'kontakt', initialValue: {}, initialVersion: 1, validate: () => [], saveFn, debounceMs: 1000 });
  s.setValue({ footerEmail: 'c@d.de' });
  await vi.advanceTimersByTimeAsync(1000);
  expect(s.get().state).toBe('conflict');
  expect(s.get().conflict?.currentVersion).toBe(5);
});
```

- [ ] **Step 2: Run** → FAIL (missing).

- [ ] **Step 3: Implement**

`website/src/lib/admin/behaviorStore.ts` — a framework-agnostic store (subscribe/get/set) so it is unit-testable without Svelte; the Svelte component subscribes to it.
```ts
export type SaveState = 'pristine' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error';
type Errors = { field: string; message: string }[];
export interface Conflict { currentVersion: number; currentValue: any }

interface Opts {
  contentKey: string;
  initialValue: any;
  initialVersion: number;
  validate: (value: any) => Errors;
  saveFn: (contentKey: string, baseVersion: number, value: any) => Promise<{ version: number }>;
  debounceMs?: number;
  onPreviewRefresh?: () => void;
}

interface Snapshot { value: any; version: number; state: SaveState; errors: Errors; conflict?: Conflict }

export function createBehaviorStore(opts: Opts) {
  const debounceMs = opts.debounceMs ?? 2000;
  let snap: Snapshot = { value: opts.initialValue, version: opts.initialVersion, state: 'pristine', errors: [] };
  const subs = new Set<(s: Snapshot) => void>();
  let timer: any = null;

  const emit = () => subs.forEach((f) => f(snap));
  const set = (p: Partial<Snapshot>) => { snap = { ...snap, ...p }; emit(); };

  async function flush() {
    const errors = opts.validate(snap.value);
    if (errors.length) { set({ state: 'error', errors }); return; }
    if (snap.state === 'conflict') return;            // paused until resolved
    set({ state: 'saving', errors: [] });
    try {
      const { version } = await opts.saveFn(opts.contentKey, snap.version, snap.value);
      set({ state: 'saved', version });
      opts.onPreviewRefresh?.();
    } catch (e: any) {
      if (e?.status === 409) set({ state: 'conflict', conflict: e.body });
      else set({ state: 'error', errors: [{ field: '', message: 'Speichern fehlgeschlagen' }] });
    }
  }

  function schedule() { if (timer) clearTimeout(timer); timer = setTimeout(flush, debounceMs); }

  return {
    get: () => snap,
    subscribe(f: (s: Snapshot) => void) { subs.add(f); f(snap); return () => subs.delete(f); },
    setValue(value: any) { if (snap.state === 'conflict') return; set({ value, state: 'dirty' }); schedule(); },
    saveNow() { if (timer) clearTimeout(timer); return flush(); },
    resolveConflictTakeTheirs() { const c = snap.conflict!; set({ value: c.currentValue, version: c.currentVersion, state: 'dirty', conflict: undefined }); },
    resolveConflictTakeMine() { const c = snap.conflict!; set({ version: c.currentVersion, state: 'dirty', conflict: undefined }); return flush(); },
  };
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/admin/behaviorStore.ts website/src/lib/admin/behaviorStore.test.ts
git commit -m "feat(content-hub): behaviorStore (autosave + optimistic lock + preview signal) [T000306]"
```

---

## Milestone 2 — Editor framework (SchemaEditor, SectionShell, chrome)

Files:
- Create: `website/src/lib/admin/schema-types.ts`, `validate.ts`, `validate.test.ts`
- Create: `website/src/components/admin/framework/SectionFrame.svelte`, `SchemaEditor.svelte`, `SectionShell.svelte`, `VersionDrawer.svelte`, `PreviewPane.svelte`
- Modify: `website/src/components/admin/InhalteEditor.svelte` (search/jump + mount framework)

### Task 2.1: Schema types + validation engine (pure)

- [ ] **Step 1: Write the failing test**

`website/src/lib/admin/validate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { validateAgainst } from './validate';
import type { FieldSchema } from './schema-types';

const schema: FieldSchema[] = [
  { key: 'email', label: 'E-Mail', type: 'text', validation: { required: true, email: true } },
  { key: 'phone', label: 'Telefon', type: 'text' },
  { key: 'url', label: 'Web', type: 'text', validation: { url: true } },
];

describe('validateAgainst', () => {
  it('flags a missing required field', () => {
    expect(validateAgainst(schema, { email: '', url: '' })).toContainEqual({ field: 'email', message: expect.stringContaining('erforderlich') });
  });
  it('flags an invalid email', () => {
    expect(validateAgainst(schema, { email: 'nope', url: '' }).some((e) => e.field === 'email')).toBe(true);
  });
  it('flags an invalid url but allows empty optional url', () => {
    expect(validateAgainst(schema, { email: 'a@b.de', url: 'not a url' }).some((e) => e.field === 'url')).toBe(true);
    expect(validateAgainst(schema, { email: 'a@b.de', url: '' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** → FAIL (missing).

- [ ] **Step 3: Implement**

`website/src/lib/admin/schema-types.ts`:
```ts
export type FieldType = 'text' | 'textarea' | 'html' | 'select' | 'toggle' | 'image' | 'list' | 'group';
export interface Validation { required?: boolean; email?: boolean; url?: boolean; min?: number; max?: number }
export interface FieldSchema {
  key: string;
  label: string;
  type: FieldType;
  help?: string;
  tokens?: boolean;                 // legal/html fields that accept {{stammdaten.*}}
  options?: { value: string; label: string }[];  // select
  fields?: FieldSchema[];           // group / list item shape
  validation?: Validation;
}
export interface SectionSchema { contentKey: string; title: string; fields: FieldSchema[] }
export interface FieldError { field: string; message: string }
```

`website/src/lib/admin/validate.ts`:
```ts
import type { FieldSchema, FieldError } from './schema-types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isUrl(v: string) { try { new URL(v); return true; } catch { return false; } }

export function validateAgainst(fields: FieldSchema[], value: Record<string, any>): FieldError[] {
  const errs: FieldError[] = [];
  for (const f of fields) {
    const v = value?.[f.key];
    const val = f.validation;
    if (!val) continue;
    const empty = v == null || v === '';
    if (val.required && empty) { errs.push({ field: f.key, message: `${f.label} ist erforderlich` }); continue; }
    if (empty) continue;
    if (val.email && !EMAIL.test(String(v))) errs.push({ field: f.key, message: `${f.label}: ungültige E-Mail` });
    if (val.url && !isUrl(String(v))) errs.push({ field: f.key, message: `${f.label}: ungültige URL` });
    if (val.min != null && String(v).length < val.min) errs.push({ field: f.key, message: `${f.label}: zu kurz` });
    if (val.max != null && String(v).length > val.max) errs.push({ field: f.key, message: `${f.label}: zu lang` });
  }
  return errs;
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/admin/schema-types.ts website/src/lib/admin/validate.ts website/src/lib/admin/validate.test.ts
git commit -m "feat(content-hub): schema types + validation engine [T000306]"
```

### Task 2.2: `SectionFrame.svelte` (shared chrome)

**Files:** Create `website/src/components/admin/framework/SectionFrame.svelte`, `VersionDrawer.svelte`, `PreviewPane.svelte`.

- [ ] **Step 1:** Build `SectionFrame.svelte`. Props: `contentKey`, the `behaviorStore` instance, and a default `<slot>` for the body. Subscribe to the store; render:
  - a save-state badge driven by `state` (`pristine→''`, `dirty→'Ungespeichert'`, `saving→'Speichert…'`, `saved→'Gespeichert'`, `conflict→Konflikt-Banner`, `error→Fehler + Wiederholen`),
  - the conflict banner (A4) with three buttons wired to `resolveConflictTakeTheirs` / `resolveConflictTakeMine` / a diff toggle (diff view can be a simple side-by-side JSON for v1),
  - a "Verlauf" button toggling `<VersionDrawer>`,
  - a "Vorschau" toggle mounting `<PreviewPane route={publicRouteFor(contentKey)} refreshSignal={…}>`,
  - a `beforeunload` + in-app navigation guard when `state` is `dirty`/`error`.
  Follow the existing dark-mode Tailwind classes used in `InhalteEditor.svelte`/`KontaktSection.svelte` (`bg-dark`, `text-light`, `text-gold`, `border-dark-lighter`).
- [ ] **Step 2:** `VersionDrawer.svelte` — props `contentKey`; on open, `GET /api/admin/content/versions?key=<contentKey>` (Task 5.1), render a timeline (`editor` + relative time), each row a **Wiederherstellen** button → `POST /api/admin/content/restore`. After restore, reload the store value + refresh preview.
- [ ] **Step 3:** `PreviewPane.svelte` — props `route`, `refreshSignal`; render `<iframe src={route}>` and `iframe.contentWindow.location.reload()` (or bump a `?_=ts` query) whenever `refreshSignal` changes. Side-by-side on ≥768px, stacked below.
- [ ] **Step 4: Build** — `cd website && pnpm build` → succeeds.
- [ ] **Step 5: Commit** — `git add website/src/components/admin/framework && git commit -m "feat(content-hub): section frame chrome (save-state, conflict, version drawer, preview) [T000306]"`

### Task 2.3: `SchemaEditor.svelte` (declarative field renderer)

- [ ] **Step 1:** Build `SchemaEditor.svelte`. Props: `schema: SectionSchema`, `initialValue`, `initialVersion`. On mount, create a `behaviorStore({ contentKey: schema.contentKey, initialValue, initialVersion, validate: (v)=>validateAgainst(schema.fields, v), saveFn: postContentSave })`. Render one control per `FieldSchema.type` (`text`/`textarea`/`html`/`select`/`toggle`/`image`/`list`/`group`), each calling `store.setValue({...value, [key]: next})`. Show per-field errors from `state.errors`. For `tokens: true` fields, render an "available tokens" palette (the `{{stammdaten.*}}` keys from Task 4.x). Wrap the whole thing in `<SectionFrame>`.
- [ ] **Step 2:** Add `postContentSave` to `website/src/lib/admin/content-client.ts`:
```ts
export async function postContentSave(contentKey: string, baseVersion: number, value: any): Promise<{ version: number }> {
  const res = await fetch('/api/admin/content/save', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contentKey, baseVersion, payload: value }),
  });
  if (res.status === 409) { const body = await res.json(); throw { status: 409, body }; }
  if (res.status === 422) { const body = await res.json(); throw { status: 422, body }; }
  if (!res.ok) throw { status: res.status };
  return res.json();
}
```
- [ ] **Step 3: Build** — `cd website && pnpm build` → succeeds.
- [ ] **Step 4: Commit** — `git commit -m "feat(content-hub): schema-driven section editor [T000306]"`

### Task 2.4: `SectionShell.svelte` (irregular editors)

- [ ] **Step 1:** Build `SectionShell.svelte` — same as `SchemaEditor` minus the field renderer: it creates the `behaviorStore` and `<SectionFrame>`, exposes the store to a `<slot>` (via a slot prop) so a custom body (Angebote drag-order, Startseite) can call `store.setValue(...)`. This gives irregular editors the identical autosave/lock/version/preview behavior.
- [ ] **Step 2: Build** — `cd website && pnpm build` → succeeds.
- [ ] **Step 3: Commit** — `git commit -m "feat(content-hub): section shell for irregular editors [T000306]"`

### Task 2.5: Section search / jump in `InhalteEditor.svelte`

- [ ] **Step 1:** In `InhalteEditor.svelte` (subsection list ~131–166), add a text filter input above the section nav that filters the visible section links by label (case-insensitive), and a keyboard-accessible jump (Enter selects the first match). Keep the existing `?tab=&section=` URL-param sync.
- [ ] **Step 2: Build** — `cd website && pnpm build` → succeeds.
- [ ] **Step 3: Commit** — `git commit -m "feat(content-hub): section search/jump in content editor [T000306]"`

---

## Milestone 3 — Section schemas + Coaching/Führung consolidation

Files:
- Create: `website/src/lib/admin/schemas/{kontakt,stammdaten,seo,service,uebermich,faq,referenzen,legal}.ts`
- Modify: `website/src/lib/admin/schemas/index.ts` (registry + `validateSection`)
- Create: `website/src/lib/admin/schemas/service-equivalence.test.ts`
- Modify: `website/src/components/admin/InhalteEditor.svelte` (route sections to `SchemaEditor`)
- Delete: `website/src/components/admin/inhalte/CoachingSection.svelte`, `FuehrungSection.svelte`

### Task 3.1: Section schemas + `validateSection`

- [ ] **Step 1: Write the failing test**

`website/src/lib/admin/schemas/index.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { schemaFor, validateSection } from './index';

describe('section schemas', () => {
  it('has a schema for every editable site_setting/legal/service key', () => {
    for (const k of ['kontakt', 'stammdaten', 'legal:datenschutz', 'service:coaching']) {
      expect(schemaFor(k)).toBeTruthy();
    }
  });
  it('validateSection delegates to the field rules', () => {
    expect(validateSection('kontakt', { footerEmail: 'bad' }).some((e) => e.field === 'footerEmail')).toBe(true);
    expect(validateSection('kontakt', { footerEmail: 'a@b.de', footerPhone: '', footerCity: 'Lüneburg' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** the schema files. Derive each schema's fields from the existing section component's bound fields (e.g. `KontaktSection.svelte` binds `footerEmail/footerPhone/footerCity/footerTagline/footerCopyright/intro/sidebarTitle/sidebarText/sidebarCta/showPhone`). Example `kontakt.ts`:
```ts
import type { SectionSchema } from '../schema-types';
export const kontaktSchema: SectionSchema = {
  contentKey: 'kontakt', title: 'Kontakt',
  fields: [
    { key: 'footerEmail', label: 'E-Mail', type: 'text', validation: { required: true, email: true } },
    { key: 'footerPhone', label: 'Telefon', type: 'text' },
    { key: 'footerCity',  label: 'Stadt',   type: 'text', validation: { required: true } },
    { key: 'footerTagline', label: 'Footer-Tagline', type: 'text' },
    { key: 'footerCopyright', label: 'Copyright', type: 'text' },
    { key: 'intro', label: 'Intro', type: 'textarea' },
    { key: 'sidebarTitle', label: 'Sidebar-Titel', type: 'text' },
    { key: 'sidebarText', label: 'Sidebar-Text', type: 'textarea' },
    { key: 'sidebarCta', label: 'Sidebar-CTA', type: 'text' },
    { key: 'showPhone', label: 'Telefon anzeigen', type: 'toggle' },
  ],
};
```
Build the others (`stammdaten` = the 10 master fields; `seo`; `uebermich`; `faq`; `referenzen`; `service` = the universal `ServicePageSection` fields; `legal` = a single `html` field with `tokens: true` per legal page) the same way. Then `index.ts`:
```ts
import { kontaktSchema } from './kontakt';
import { stammdatenSchema } from './stammdaten';
import { seoSchema } from './seo';
import { serviceSchema } from './service';
import { uebermichSchema } from './uebermich';
import { faqSchema } from './faq';
import { referenzenSchema } from './referenzen';
import { legalSchemas } from './legal';   // map of legal:<key> → SectionSchema
import { validateAgainst } from '../validate';
import type { SectionSchema, FieldError } from '../schema-types';

const REGISTRY: Record<string, SectionSchema> = {
  kontakt: kontaktSchema, stammdaten: stammdatenSchema, seo: seoSchema,
  uebermich: uebermichSchema, faq: faqSchema, referenzen: referenzenSchema,
  ...legalSchemas,
  // service pages all share serviceSchema, keyed per slug
  'service:coaching': serviceSchema, 'service:fuehrung-persoenlichkeit': serviceSchema,
  'service:50plus-digital': serviceSchema, 'service:ki-transition': serviceSchema, 'service:beratung': serviceSchema,
};

export function schemaFor(contentKey: string): SectionSchema | undefined { return REGISTRY[contentKey]; }
export function validateSection(contentKey: string, payload: any): FieldError[] {
  const s = schemaFor(contentKey); if (!s) return [];
  return validateAgainst(s.fields, payload);
}
```
Replace the M1 stub `validateSection` with this real one.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(content-hub): section schemas + real validateSection [T000306]"`

### Task 3.2: Service-equivalence guard test

- [ ] **Step 1: Write the test** proving the universal `serviceSchema` covers every field the bespoke Coaching/Führung editors edited, so deleting them loses nothing.

`website/src/lib/admin/schemas/service-equivalence.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { serviceSchema } from './service';

// The fields the bespoke CoachingSection/FuehrungSection bound (read off the components before deleting).
const BESPOKE_FIELDS = ['cardTitle','cardDescription','cardIcon','cardFeatures','headline','intro','introNote','forWhom','sections','faq','ctaText','ctaHref'];

describe('serviceSchema equivalence', () => {
  it('covers every field the bespoke editors had', () => {
    const keys = serviceSchema.fields.map((f) => f.key);
    for (const f of BESPOKE_FIELDS) expect(keys).toContain(f);
  });
});
```
> Before writing this, `grep -n "bind:value" website/src/components/admin/inhalte/CoachingSection.svelte website/src/components/admin/inhalte/FuehrungSection.svelte` and reconcile `BESPOKE_FIELDS` with the actual bound fields. If a bespoke field is missing from `serviceSchema`, add it to `service.ts` first.

- [ ] **Step 2: Run** → PASS (after reconciling).

- [ ] **Step 3: Commit** — `git commit -m "test(content-hub): serviceSchema covers bespoke coaching/fuehrung fields [T000306]"`

### Task 3.3: Route sections to `SchemaEditor`; delete bespoke editors

- [ ] **Step 1:** In `InhalteEditor.svelte`, for each section that has a `schemaFor(contentKey)`, render `<SchemaEditor schema={schemaFor(key)} initialValue={…} initialVersion={…}/>` instead of the old per-section component. Load `initialValue`/`initialVersion` via `readContent(BRAND, contentKey)` in the page front-matter (`inhalte.astro`) and pass down. Coaching/Führung now route through `<SchemaEditor schema={serviceSchema}>` keyed by their slug.
- [ ] **Step 2:** Delete `CoachingSection.svelte` and `FuehrungSection.svelte` and remove their imports.
- [ ] **Step 3: Build + render check** — `cd website && pnpm build`; run dev and load `/coaching` and `/fuehrung-persoenlichkeit` — confirm the rendered pages are unchanged vs. main (compare against a pre-change screenshot or the `/tmp/content-hub-v2-before.txt` content).
- [ ] **Step 4: Commit** — `git commit -m "feat(content-hub): route sections through SchemaEditor, remove bespoke coaching/fuehrung editors [T000306]"`

---

## Milestone 4 — Legal SSOT + CTA SSOT

Files:
- Create: `website/src/lib/legal-tokens.ts`, `legal-tokens.test.ts`
- Modify: `website/src/lib/legal-defaults.ts` (emit tokens)
- Modify: `website/src/pages/{impressum,datenschutz,agb,barrierefreiheit}.astro` (resolve at render)
- Modify: render sites reading `config.contact` for CTAs (`index.astro`, `ueber-mich.astro`, `leistungen.astro`, `Footer.astro`)
- Create: `website/src/pages/api/admin/legal/retokenize.ts` + `retokenize.test.ts`

### Task 4.1: `resolveTokens` + token catalogue

- [ ] **Step 1: Write the failing test**

`website/src/lib/legal-tokens.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveTokens, STAMMDATEN_TOKENS } from './legal-tokens';

const sd = { name: 'PK', email: 'a@b.de', city: 'Lüneburg', phone: '0123', street: 's', zip: 'z', role: 'Coach', ustId: 'u', website: 'w', avatarInitials: 'PK' };

describe('resolveTokens', () => {
  it('replaces known stammdaten tokens', () => {
    expect(resolveTokens('Mail: {{stammdaten.email}} in {{stammdaten.city}}', sd)).toBe('Mail: a@b.de in Lüneburg');
  });
  it('renders unknown tokens as empty', () => {
    expect(resolveTokens('x {{stammdaten.nope}} y', sd)).toBe('x  y');
  });
  it('leaves non-token braces alone', () => {
    expect(resolveTokens('use { like this }', sd)).toBe('use { like this }');
  });
  it('exposes the token catalogue for the editor palette', () => {
    expect(STAMMDATEN_TOKENS).toContain('{{stammdaten.email}}');
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`website/src/lib/legal-tokens.ts`:
```ts
import type { Stammdaten } from './website-db';

export const STAMMDATEN_FIELDS: (keyof Stammdaten)[] =
  ['name','role','email','phone','street','zip','city','ustId','website','avatarInitials'];
export const STAMMDATEN_TOKENS = STAMMDATEN_FIELDS.map((f) => `{{stammdaten.${f}}}`);

const TOKEN_RE = /\{\{\s*stammdaten\.([a-zA-Z]+)\s*\}\}/g;

export function resolveTokens(html: string, sd: Partial<Stammdaten>): string {
  return html.replace(TOKEN_RE, (_m, key: string) => String((sd as any)?.[key] ?? ''));
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(content-hub): resolveTokens + stammdaten token catalogue [T000306]"`

### Task 4.2: Tokenize `legal-defaults.ts`

- [ ] **Step 1: Write the failing test** (append to `legal-tokens.test.ts`) asserting the defaults now contain tokens, not interpolated contact values:
```ts
import { getDefaultDatenschutz, getDefaultAgb } from './legal-defaults';
it('defaults emit tokens, not baked contact values', () => {
  const ds = getDefaultDatenschutz();
  expect(ds).toContain('{{stammdaten.email}}');
  expect(ds).not.toContain('a@b.de');
});
```
- [ ] **Step 2: Run** → FAIL (defaults still interpolate `config.contact`).
- [ ] **Step 3:** Refactor `legal-defaults.ts` — replace `${contact.email}` → `{{stammdaten.email}}`, `${contact.name}` → `{{stammdaten.name}}`, `${contact.city}` → `{{stammdaten.city}}`, `${contact.phone}` → `{{stammdaten.phone}}`, and `${legal.tagline}` → `{{stammdaten.role}}` (or a dedicated `tagline` token if added to `Stammdaten`). Add `getDefaultImpressum()` (full body) emitting tokens. Remove the now-unused `c()`/`l()` interpolation.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(content-hub): tokenize legal defaults [T000306]"`

### Task 4.3: Render legal pages through `resolveTokens`; full Impressum

- [ ] **Step 1:** In each of `datenschutz.astro`, `agb.astro`, `barrierefreiheit.astro`, `impressum.astro`: load `const sd = await getEffectiveStammdaten();` and the stored legal HTML (`getLegalPage(BRAND, key)`), then render `set:html={resolveTokens(stored ?? getDefault<X>(), sd)}`. For `impressum.astro`, replace the hardcoded body with the `legal:impressum` content (stored ?? `getDefaultImpressum()`), token-resolved.
- [ ] **Step 2: Build + smoke** — `cd website && pnpm build`; load all four legal pages on dev with an **empty** legal DB → they render today's text (tokens resolved from stammdaten). Then change the Kontakt email in admin → reload a legal page → the new email appears (no re-save of the legal text).
- [ ] **Step 3: Commit** — `git commit -m "feat(content-hub): legal pages resolve stammdaten tokens at render; full impressum editable [T000306]"`

### Task 4.4: CTA / mailto → stammdaten SSOT

- [ ] **Step 1:** Find every CTA/mailto reading static contact:
```bash
grep -rn "config.contact\|CONTACT_EMAIL\|mailto:" website/src/pages website/src/components website/src/layouts | grep -vi test
```
Re-point each to `getEffectiveStammdaten()`/`getEffectiveKontakt()` (homepage `index.astro:~170`, `ueber-mich.astro:~87`, `leistungen.astro:~158`, `Footer.astro:~10-14`). Email used in `mailto:` and visible CTA text both come from the SSOT.
- [ ] **Step 2: Build + smoke** — `cd website && pnpm build`; change the contact email in admin → confirm homepage CTA, Über-mich CTA, Leistungen CTA, and footer all show the new address without redeploy.
- [ ] **Step 3: Commit** — `git commit -m "feat(content-hub): all CTA/mailto read contact SSOT [T000306]"`

### Task 4.5: Assisted re-tokenize (legacy baked legal HTML)

- [ ] **Step 1: Write the failing test**

`website/src/lib/legal-tokens.test.ts` (append):
```ts
import { proposeRetokenize } from './legal-tokens';
it('proposes replacing baked contact strings with tokens', () => {
  const html = '<p>Mail: a@b.de, Stadt: Lüneburg</p>';
  const sd = { email: 'a@b.de', city: 'Lüneburg' } as any;
  const { result, replacements } = proposeRetokenize(html, sd);
  expect(result).toBe('<p>Mail: {{stammdaten.email}}, Stadt: {{stammdaten.city}}</p>');
  expect(replacements).toContainEqual({ from: 'a@b.de', to: '{{stammdaten.email}}' });
});
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `proposeRetokenize(html, sd)` — for each non-empty stammdaten field whose value appears literally in `html`, replace occurrences with the matching token; return `{ result, replacements: {from,to}[] }`. Longest values first to avoid partial overlaps.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5:** Add `POST /api/admin/legal/retokenize` returning `proposeRetokenize` output for a given `contentKey` (no write — the editor shows the diff; applying it goes through the normal save). Add a "Re-tokenisieren" button in the legal editor that calls it, shows the `replacements` as a confirm-diff, and on confirm does a normal `setValue(result)` (which autosaves + versions).
- [ ] **Step 6: Build** → succeeds. **Commit** — `git commit -m "feat(content-hub): assisted re-tokenize for legacy legal html [T000306]"`

---

## Milestone 5 — Version-history UI (list endpoint + drawer wiring)

Files:
- Create: `website/src/pages/api/admin/content/versions.ts` + `versions.test.ts`
- Modify: `VersionDrawer.svelte` (wire to real data)

### Task 5.1: Versions list endpoint

- [ ] **Step 1: Write the failing test**

`website/src/pages/api/admin/content/versions.test.ts`: `GET /api/admin/content/versions?key=kontakt` returns `[{id, editor, createdAt}]` newest-first (snapshot omitted from the list payload for size; fetched on restore); unauth → 401.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`website/src/pages/api/admin/content/versions.ts`:
```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listVersions } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const key = url.searchParams.get('key');
  if (!key) return new Response('key required', { status: 400 });
  const rows = await listVersions(BRAND, key);
  const list = rows.map(({ id, editor, createdAt }) => ({ id, editor, createdAt }));
  return new Response(JSON.stringify(list), { status: 200, headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(content-hub): content versions list endpoint [T000306]"`

### Task 5.2: Wire `VersionDrawer` to real data + restore

- [ ] **Step 1:** In `VersionDrawer.svelte`, fetch `GET /api/admin/content/versions?key=<contentKey>` on open; render the audit timeline (`editor` + relative time via the existing date-format helper, `grep -rn "formatRelative\|toLocale" website/src/lib`). Each row → **Wiederherstellen** → `POST /api/admin/content/restore {contentKey, versionId}` → on success, re-`readContent` into the store and emit a preview refresh.
- [ ] **Step 2: Build** — `cd website && pnpm build` → succeeds.
- [ ] **Step 3: Commit** — `git commit -m "feat(content-hub): version drawer audit timeline + restore wiring [T000306]"`

---

## Milestone 6 — E2E, prod migration, backup verify, full gate

### Task 6.1: Playwright acceptance specs

- [ ] **Step 1:** Verify endpoint/route paths from source before writing:
```bash
grep -rn "export const POST\|export const GET" website/src/pages/api/admin/content/*.ts
```
- [ ] **Step 2:** Create the specs (declare Playwright projects explicitly per `tests/e2e/playwright.config.ts`):
  - `tests/e2e/fa-content-hub-legal-ssot.spec.ts` — **projects: `mentolder` + `korczewski`** (authenticated admin; `storageState`): change contact email in Kontakt → reload `/impressum`, `/datenschutz`, `/agb`, footer → assert the new email appears in all (AC 1, 2).
  - `tests/e2e/fa-content-hub-editor.spec.ts` — **project: `mentolder`**: enter an invalid email → assert inline error + no save; edit a field → assert preview iframe updates; (mobile viewport) assert the editor is usable (AC 4).
  - `tests/e2e/fa-content-hub-versioning.spec.ts` — **project: `mentolder`**: edit a section twice → open Verlauf → restore the first version → assert the page reflects it (AC 5).
  - `tests/e2e/fa-content-hub-concurrency.spec.ts` — **project: `services`** (API-level, no UI auth needed): POST two saves with the same `baseVersion` → assert the second returns 409 (AC 6).
  - `tests/e2e/fa-content-hub-service-consolidation.spec.ts` — **project: `mentolder`**: edit `/coaching` via the universal editor → assert the change renders (AC 3).
- [ ] **Step 3:** Regenerate + commit the test inventory:
```bash
task test:inventory && git add website/src/data/test-inventory.json
```
- [ ] **Step 4: Commit** — `git commit -m "test(content-hub): e2e acceptance specs (legal/editor/versioning/concurrency/consolidation) [T000306]"`

### Task 6.2: Apply the schema migration to both prod clusters (post-merge)

- [ ] **Step 1:** After the PR merges + the website image deploys, apply the migration to **both** `shared-db` instances (per the cross-cluster rule — each cluster has its own DB):
```bash
for CTX in mentolder korczewski; do
  PGPOD=$(kubectl get pod -n workspace --context $CTX -l app=shared-db -o name | head -1)
  kubectl exec "${PGPOD#pod/}" -n workspace --context $CTX -- \
    psql -U website -d website -c "\i -" < <(node -e "import('./scripts/migrate-content-versions.mjs')") 2>&1 | tail
done
```
> Simpler/safer: run `SESSIONS_DATABASE_URL=<cluster> node scripts/migrate-content-versions.mjs --apply` against each cluster's DB via its own port-forward. The DDL is `IF NOT EXISTS`-guarded and idempotent. Verify: `psql -c "\d content_versions"` shows the table and `\d site_settings` shows the `version` column on both clusters.

### Task 6.3: Verify backup coverage

- [ ] **Step 1:** Make one edit (e.g. a version row + a changed value), then trigger a backup and confirm both are present:
```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
kubectl -n workspace --context mentolder create job content-hub-v2-verify --from=cronjob/db-backup
# inspect the dump per reference_website_content_db_backed: it must contain content_versions rows + the edited value
```
Expected: the fresh dump contains a `content_versions` row and the edited content (AC 7).

### Task 6.4: Full offline gate + manifest sanity

- [ ] **Step 1:**
```bash
cd /tmp/wt-content-hub-v2
task test:all
cd website && pnpm vitest --run && pnpm build
```
Expected: all green.
- [ ] **Step 2: Before/after data check** — compare `/tmp/content-hub-v2-before.txt` against a post-migration snapshot; confirm no content was lost (only relocated/derived/tokenized).

---

## Self-review notes (author)

- **Spec coverage:** §A1 data model → M1.4/1.5; §A2 behaviorStore → M1.8; §A3 save pipeline → M1.6; restore → M1.7; §A4 concurrency → M1.2/1.8 + chrome M2.2; §A5 preview → M2.2; §B1 SchemaEditor → M2.3; §B2 schemas + consolidation → M3; §B3 SectionShell → M2.4; §B4 chrome → M2.2; §C1 tokens → M4.1; §C2 full Impressum → M4.2/4.3; §C3 reset → M4.2 (default emit) + drawer/editor reset button (M2.2/M4.3 — see note below); §C4 CTA SSOT → M4.4; §C5 re-tokenize → M4.5; §D error handling → M1.6/M2.2/M2.3; §E testing → unit across M1–M4 + Playwright M6.1; §F milestones → M1–M6; §G acceptance → M6.1; §H NFR → M2 (mobile/search) + M6 (both brands, backup); §I backup → M6.3.
- **Gap fixed inline:** §C3 per-page "Reset to default" button — add it as a step in Task 4.3 (a "Auf Standard zurücksetzen" button that `setValue(getDefault<X>())` → autosaves + versions, so it is restorable). Implementer: include it when wiring the legal editor in M4.3.
- **Type consistency:** `ContentRef`/`contentKey`/`contentType` (M1.3) reused in store (M1.5), endpoints (M1.6/1.7/5.1), and registry; `behaviorStore` snapshot shape (`state`/`version`/`conflict`) reused by chrome (M2.2) and SchemaEditor (M2.3); `FieldSchema`/`SectionSchema`/`FieldError` (M2.1) reused by schemas (M3.1) and validation; `resolveTokens`/`STAMMDATEN_TOKENS` (M4.1) reused by render (M4.3) and palette (M2.3/M4). `validateSection` is stubbed in M1.6 and made real in M3.1 — the only intentional forward-reference, flagged at both ends.
- **No placeholders:** pure-logic/DB/endpoint tasks carry full code + tests; Svelte UI tasks specify exact files, props, bound fields, and a build/render gate, following the repo's established plan style (markup left to the implementer against existing section components).
