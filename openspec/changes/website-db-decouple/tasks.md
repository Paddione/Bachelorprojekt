---
title: "website-db-decouple — Implementation Plan"
ticket_id: T001490
domains: [website, infra]
status: plan_staged
file_locks:
  - Taskfile.yml
  - environments/schema.yaml
  - website/src/lib/website-db.ts
  - website/src/lib/content.ts
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# website-db-decouple — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

_Ticket: T001490_

**Goal:** Serve both brands' public website content from a build-time, Zod-validated git bundle so public pages are 100 % available with zero runtime dependency on PostgreSQL, Keycloak, LLM, or CalDAV.

**Architecture:** All ~13 content domains become JSON files under `website/content/<brand>/`, validated and embedded at build time via a new `content-bundle.ts`; `getEffective*` reads synchronously from the bundle. Editing writes back through a bot-PR publish pipeline (GitHub Contents API, squash+auto-merge, blob-SHA concurrency) instead of the database. Timeline/CalDAV widgets move to fail-soft client islands; `db-pool.ts` (retained for admin) gets timeouts. A `PRIMARY_FRONTEND` env switch repoints the apex domain between the Astro and React frontends, which share identical content and API contracts.

**Tech Stack:** Astro 5 + Svelte 5, TypeScript, Zod, `pg`, GitHub Contents API, Kustomize + envsubst overlays, SealedSecrets, Vitest, BATS, Playwright.

## Global Constraints

- `website/src/lib/website-db.ts` effective S1 budget is **−1506** (Ist 2106, limit 600, not baselined): the file may ONLY shrink (delete content readers) — every new piece of logic goes into a new module. No net growth.
- New logic lives in small, focused new modules; helper modules are pure (no back-import onto DB/API layers) to keep the `website` import graph acyclic (S2).
- No `*.mentolder.de` / `*.korczewski.de` string literals in `website/src/**`, `k3d/`, `prod*/` code (S3) — resolve brand/domain via `PROD_DOMAIN`, `BRAND`/`BRAND_ID`, `configmap-domains.yaml`, and overlay envsubst.
- Every new `k3d/*.yaml` is referenced by a `kustomization.yaml`; every new `scripts/*.mjs` is reachable from Taskfile/CI/docs (S4).
- No net increase in explicit `any` in `website/src/**` (CQ02, limit ≤ 200). All new exports fully typed.
- The `GET /api/homepage` response contract (`document` body + `X-Homepage-Version` header, 204 when empty) is frozen — `mentolder-web/` depends on it.
- The shared homepage-block Zod schema (`mentolder-web/src/blocks/schema.ts`) with `SCHEMA_VERSION = 1` is the source of truth for the block document contract; the new website-side schema mirrors it (fail-closed on version mismatch).

## File Structure

New modules (small, focused, under their S1 limits with growth reserve):

- `website/src/content-schema/index.ts` — barrel re-exporting all domain schemas + a `ContentBundleSchema` map; pure module.
- `website/src/content-schema/homepage.ts` — Zod schemas for `homepage`, `homepage-blocks` (mirrors `mentolder-web/src/blocks/schema.ts`, same `SCHEMA_VERSION`), `seo`.
- `website/src/content-schema/pages.ts` — Zod for `faq`, `kontakt`, `ueber-mich`, `leistungen`, `services`, `referenzen`.
- `website/src/content-schema/site.ts` — Zod for `stammdaten`, `navigation`, `footer`, `kore-flags`.
- `website/src/lib/content-bundle.ts` — build-time loader: imports all `website/content/<brand>/*.json`, validates fail-closed, exposes typed synchronous getters.
- `website/src/lib/content-publish.ts` — GitHub Contents-API publisher: validate → commit on `content/<brand>-<domain>-<ts>` → squash+auto-merge PR; blob-SHA optimistic concurrency (409).
- `scripts/export-site-content.mjs` — one-shot DB→JSON exporter seeding `website/content/<brand>/`.
- `website/content/mentolder/*.json`, `website/content/korczewski/*.json` — seeded content (13 domains per brand).
- `k3d/website-content-token-secret.yaml` — placeholder Secret ref for the fine-grained GitHub token (dev); prod via SealedSecret.

Modified (all within positive residual budget except the shrink-only `website-db.ts`):

- `website/src/lib/content.ts` (Ist 324, Budget 276) — `getEffective*` → synchronous bundle reads.
- `website/src/lib/website-db.ts` (Ist 2106, Budget −1506) — shrink only: delete content-reader functions + content types now owned by `content-schema`.
- `website/src/pages/index.astro` (Ist 243, Budget 157) — remove timeline/CalDAV SSR awaits; mount client islands.
- `website/src/pages/api/homepage.ts` (Ist 27, Budget 573) — bundle source + try/catch.
- `website/src/lib/db-pool.ts` (Ist 60, Budget 540) — add pool timeouts + `statement_timeout`.
- `website/src/config/brands/mentolder.ts` (Ist 428, Budget 172) — remove seed defaults migrated into content JSON if needed.
- `environments/schema.yaml`, `environments/mentolder.yaml`, `environments/korczewski.yaml`, `k3d/website.yaml` (+ its `kustomization.yaml`) — `PRIMARY_FRONTEND` wiring.
- Admin save endpoints under `website/src/pages/api/admin/**/save.ts` — route through `content-publish.ts`.

### S1 pre-flight (effective threshold = max(limit, baseline); all files below are un-baselined)

| Datei | Ist | Budget |
|---|---|---|
| `website/src/lib/website-db.ts` | 2106 | -1506 |
| `website/src/lib/content.ts` | 324 | 276 |
| `website/src/pages/index.astro` | 243 | 157 |
| `website/src/config/brands/mentolder.ts` | 428 | 172 |
| `website/src/lib/db-pool.ts` | 60 | 540 |
| `website/src/pages/api/homepage.ts` | 27 | 573 |
| `website/src/lib/homepage-blocks-store.ts` | 198 | 402 |
| `website/astro.config.mjs` | 33 | 467 |

`website-db.ts` has a negative budget — the plan only **shrinks** it (deletes content readers); it never grows.

---

## Task 1: Content-domain Zod schemas

**Files:**
- Create: `website/src/content-schema/index.ts`
- Create: `website/src/content-schema/homepage.ts`
- Create: `website/src/content-schema/pages.ts`
- Create: `website/src/content-schema/site.ts`
- Test: `website/src/content-schema/__tests__/schema.test.ts`

**Interfaces:**
- Produces: `ContentBundleSchema: Record<Domain, z.ZodType>` where `Domain` is the union of the 13 domain keys (`'homepage' | 'homepage-blocks' | 'faq' | 'kontakt' | 'ueber-mich' | 'leistungen' | 'services' | 'stammdaten' | 'navigation' | 'footer' | 'referenzen' | 'seo' | 'kore-flags'`); named schemas `HomepageSchema`, `HomepageBlocksSchema`, `FaqSchema`, … ; re-exported inferred types `HomepageContent`, `FaqItem`, `KontaktContent`, `UebermichContent`, `Stammdaten`, `NavItem`, `FooterConfig`, `KoreFlags`, `ReferenzenConfig`. `HomepageBlocksSchema` carries `schemaVersion` and a `blocks` discriminated union mirroring `mentolder-web/src/blocks/schema.ts` (`SCHEMA_VERSION = 1`).
- Consumes: existing content interfaces in `website/src/lib/website-db.ts` (as the shape reference to mirror) — `HomepageContent`, `UebermichContent`, `FaqItem`, `KontaktContent`, `Stammdaten`, `NavItem`, `FooterConfig`, `KoreFlags`, `ReferenzenConfig`.

- [ ] **Step 1: Write the failing test**

```ts
// website/src/content-schema/__tests__/schema.test.ts
import { describe, it, expect } from 'vitest';
import { ContentBundleSchema, HomepageBlocksSchema } from '../index';

describe('content-schema', () => {
  it('exposes a schema for every content domain', () => {
    const domains = Object.keys(ContentBundleSchema).sort();
    expect(domains).toContain('homepage');
    expect(domains).toContain('homepage-blocks');
    expect(domains).toContain('kore-flags');
    expect(domains).toHaveLength(13);
  });

  it('rejects a homepage-blocks doc with the wrong schemaVersion', () => {
    const bad = { schemaVersion: 999, blocks: [] };
    expect(HomepageBlocksSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts a minimal valid homepage-blocks doc', () => {
    const ok = { schemaVersion: 1, blocks: [] };
    expect(HomepageBlocksSchema.safeParse(ok).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir website vitest run src/content-schema/__tests__/schema.test.ts`
Expected: FAIL — module `../index` not found.

- [ ] **Step 3: Implement the schema modules**

Implement each domain schema in its file. `HomepageBlocksSchema` pins `schemaVersion` fail-closed (`z.literal(1)`) and reuses the discriminated `Block` union shape from `mentolder-web/src/blocks/schema.ts`. `index.ts` assembles `ContentBundleSchema` and re-exports inferred types. Keep each file focused; no import back onto `website-db.ts`/`db-pool.ts` (S2, pure module).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --dir website vitest run src/content-schema/__tests__/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** — `feat(website): Zod content-domain schemas [T001490]`

---

## Task 2: Build-time content bundle loader

**Files:**
- Create: `website/src/lib/content-bundle.ts`
- Test: `website/src/lib/__tests__/content-bundle.test.ts`

**Interfaces:**
- Consumes: `ContentBundleSchema` and inferred types from `website/src/content-schema/index.ts`.
- Produces: `loadDomain<D extends Domain>(brand: string, domain: D): SchemaOf<D>` (synchronous, throws `BundleValidationError` on invalid/missing file) and thin typed getters `bundleHomepage(brand): HomepageContent`, `bundleFaq(brand): FaqItem[]`, `bundleStammdaten(brand): Stammdaten`, etc. `BundleValidationError extends Error` with `{ brand: string; domain: string; issues: string[] }`. Files are read via `import.meta.glob('/content/**/*.json', { eager: true })` so content is embedded at build time. A `validateAllBundles()` export iterates every brand×domain so a broken set fails the build loudly.

- [ ] **Step 1: Write the failing test**

```ts
// website/src/lib/__tests__/content-bundle.test.ts
import { describe, it, expect } from 'vitest';
import { loadDomain, BundleValidationError } from '../content-bundle';

describe('content-bundle', () => {
  it('loads a valid seeded domain synchronously', () => {
    const hp = loadDomain('mentolder', 'homepage');
    expect(hp.hero.title).toBeTypeOf('string');
  });

  it('throws BundleValidationError naming brand+domain on a missing file', () => {
    expect(() => loadDomain('nonexistent-brand', 'homepage')).toThrow(BundleValidationError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir website vitest run src/lib/__tests__/content-bundle.test.ts`
Expected: FAIL — `content-bundle` module missing.

- [ ] **Step 3: Implement `content-bundle.ts`**

Eagerly glob-import all `website/content/**/*.json`, validate each against `ContentBundleSchema[domain]`, and cache the parsed result keyed by `brand/domain`. On parse failure or missing file throw `BundleValidationError` with flattened Zod issues. `validateAllBundles()` iterates every brand×domain so the build fails on any invalid file. No DB import (S2).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --dir website vitest run src/lib/__tests__/content-bundle.test.ts`
Expected: PASS (needs the Task 3 seed files present; sequence Task 3 before final green if run in isolation).

- [ ] **Step 5: Commit** — `feat(website): build-time content bundle loader [T001490]`

---

## Task 3: DB export seed script + content files

**Files:**
- Create: `scripts/export-site-content.mjs`
- Create: `website/content/mentolder/*.json` (13 domains)
- Create: `website/content/korczewski/*.json` (13 domains)
- Modify: `Taskfile.yml` (register a `content:export` task so the script is not orphaned — S4)

**Interfaces:**
- Consumes: the effective content produced by today's `getEffective*` in `website/src/lib/content.ts` (pre-decouple) and the raw rows in `site_settings` (`brand`, `key`, `value`), `homepage_block_documents` (`brand`, `document` jsonb, `version`). Reuses `resolveStammdaten`/`resolveHighlightTable` projections from `content-projection.ts` so exported values equal what the site renders today.
- Produces: one JSON file per domain per brand, each conforming to the Task 1 schema.

- [ ] **Step 1: Write the failing check (structural)**

Add a BATS assertion (folded into Task 8's spec file) asserting every brand has all 13 domain files. First run it before seeding:
Run: `bats tests/spec/website-core.bats -f 'content bundle'`
Expected: FAIL — `website/content/mentolder/` does not exist yet.

- [ ] **Step 2: Implement `export-site-content.mjs`**

Connect via `SESSIONS_DATABASE_URL`, read each brand's effective values, project them through the existing projection helpers, and write validated JSON (import `ContentBundleSchema` to fail-closed before writing so no invalid seed lands). Idempotent: re-running overwrites. Register `task content:export ENV=<brand>` in `Taskfile.yml`.

- [ ] **Step 3: Run the exporter for both brands**

Run: `task content:export ENV=mentolder && task content:export ENV=korczewski`
Then re-run the BATS check.
Expected: PASS — all 13 files exist per brand and parse against their schemas.

- [ ] **Step 4: Commit** — `feat(website): seed content bundle from DB export [T001490]`

---

## Task 4: Public content path reads from the bundle

**Files:**
- Modify: `website/src/lib/content.ts` (Budget 276)
- Modify: `website/src/lib/website-db.ts` (Budget -1506 — shrink only)
- Test: `website/src/lib/content.test.ts` (extend existing)

**Interfaces:**
- Consumes: Task 2 typed getters (`bundleHomepage`, `bundleFaq`, `bundleStammdaten`, `bundleServices`, `bundleLeistungen`, `bundleNavigation`, `bundleFooter`, `bundleKoreFlags`, `bundleReferenzen`, `bundleUebermich`, `bundleKontakt`).
- Produces: `getEffectiveHomepage()`, `getEffectiveServices()`, `getEffectiveLeistungen()`, `getEffectiveFaq()`, `getEffectiveKontakt()`, `getEffectiveUebermich()`, `getEffectiveStammdaten()`, `getEffectiveNavigation()`, `getEffectiveFooter()`, `getEffectiveKoreFlags()`, `getEffectiveReferenzen()`, `getEffectiveHighlightTable()` — same names and return types, now backed by the bundle (kept `async` for signature stability, resolving synchronously from the bundle). Delete from `website-db.ts`: `getHomepageContent`, `getUebermichContent`, `getFaqContent`, `getKontaktContent`, `getServiceConfig`, `getLeistungenConfig`, `getReferenzen`, and the content-only `getJsonSetting`/`getSiteSetting` content usages plus their now-unused content interfaces/keys — a net shrink of `website-db.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// extend website/src/lib/content.test.ts
import { getEffectiveHomepage } from './content';

it('resolves homepage from the bundle without a DB query', async () => {
  const hp = await getEffectiveHomepage();
  expect(hp.hero.title).toBeTypeOf('string');
  expect(hp.processSteps.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --dir website vitest run src/lib/content.test.ts -t 'resolves homepage from the bundle'`
Expected: FAIL — current `getEffectiveHomepage` still calls `getHomepageContent` (DB) and this test's fixtures assume no DB.

- [ ] **Step 3: Rewire `content.ts` and shrink `website-db.ts`**

Point each `getEffective*` at the corresponding bundle getter; drop the `.catch(() => …)` cascade and the `config`-default branches now owned by the seeded JSON. Delete the content-reader functions and content-only types from `website-db.ts` (shrink toward its negative budget; the timeline/billing/ticket functions stay).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --dir website vitest run src/lib/content.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** — `refactor(website): getEffective* reads content bundle [T001490]`

---

## Task 5: Fail-soft widgets, pool timeouts, homepage API hardening

**Files:**
- Modify: `website/src/pages/index.astro` (Budget 157)
- Modify: `website/src/lib/db-pool.ts` (Budget 540)
- Modify: `website/src/pages/api/homepage.ts` (Budget 573)
- Create: `website/src/components/islands/TimelineIsland.svelte`
- Create: `website/src/components/islands/NextSlotIsland.svelte`
- Test: `website/src/lib/__tests__/db-pool.test.ts`, `website/src/pages/api/__tests__/homepage.test.ts` (create if absent)

**Interfaces:**
- Consumes: `getEffectiveKoreFlags()` (bundle) for the timeline gate; `readCurrent(brand)` from `homepage-blocks-store.ts` for `/api/homepage`.
- Produces: `db-pool.ts` `pool` configured with `connectionTimeoutMillis: 2000`, `idleTimeoutMillis`, and a `statement_timeout` (via `options: '-c statement_timeout=2000'` on `PoolConfig`); `GET /api/homepage` wrapped in try/catch returning 204 (empty) with the `X-Homepage-Version` header on failure, never an uncaught 500. Timeline + next-slot become client islands that fetch `/api/timeline` and the slots endpoint with an `AbortController` timeout and unmount on error.

- [ ] **Step 1: Write the failing test**

```ts
// website/src/pages/api/__tests__/homepage.test.ts
import { vi } from 'vitest';
vi.mock('../../../lib/homepage-blocks-store', () => ({
  readCurrent: vi.fn().mockRejectedValue(new Error('db down')),
}));
import { GET } from '../homepage';

it('returns 204 (not a thrown 500) when the store read fails', async () => {
  const res = await GET({ request: new Request('http://x/api/homepage') } as any);
  expect([200, 204]).toContain(res.status);
  expect(res.headers.get('X-Homepage-Version')).not.toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --dir website vitest run src/pages/api/__tests__/homepage.test.ts`
Expected: FAIL — current handler has no try/catch and rethrows on store error.

- [ ] **Step 3: Implement islands + timeouts + try/catch**

Move the `listTimeline` and `getAvailableSlots` awaits out of `index.astro` into the two islands (`client:idle`), each with an abortable fetch and silent hide on error/timeout. Add the pool timeout options in `db-pool.ts`. Wrap `readCurrent` in `homepage.ts` with try/catch that logs and returns 204 with the version header (contract preserved).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --dir website vitest run src/pages/api/__tests__/homepage.test.ts src/lib/__tests__/db-pool.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** — `fix(website): fail-soft widgets, pool timeouts, homepage API guard [T001490]`

---

## Task 6: Content publish pipeline (GitHub Contents API)

**Files:**
- Create: `website/src/lib/content-publish.ts`
- Test: `website/src/lib/__tests__/content-publish.test.ts`

**Interfaces:**
- Consumes: `ContentBundleSchema` (validate before publish); `GITHUB_CONTENT_TOKEN`, `CONTENT_REPO` (owner/name), `CONTENT_BRANCH_BASE` (default `main`) from env.
- Produces: `publishContent(input: { brand: string; domain: Domain; payload: unknown; baseSha: string | null; editor: string; client?: GitHubClient }): Promise<PublishResult>` where `PublishResult = { ok: true; sha: string; prNumber: number; prUrl: string } | { ok: false; status: 409; currentSha: string; currentValue: unknown } | { ok: false; status: 422; errors: string[] }`. Flow: Zod-validate (422 on fail) → GET current file blob SHA → if `baseSha` mismatches current → 409 → else create branch `content/<brand>-<domain>-<ts>`, PUT the file, open PR labelled `content`, enable squash + auto-merge. GitHub calls behind an injectable `client` for testing.

- [ ] **Step 1: Write the failing test (409 + success + 422)**

```ts
// website/src/lib/__tests__/content-publish.test.ts
import { describe, it, expect } from 'vitest';
import { publishContent } from '../content-publish';

const validFaq = [{ question: 'q', answer: 'a' }];

it('returns 409 when baseSha is stale', async () => {
  const gh = fakeGitHub({ currentSha: 'SHA_NEW' });
  const r = await publishContent({ brand: 'mentolder', domain: 'faq', payload: validFaq, baseSha: 'SHA_OLD', editor: 'a@b', client: gh });
  expect(r).toMatchObject({ ok: false, status: 409, currentSha: 'SHA_NEW' });
});

it('opens a squash-auto-merge PR on success', async () => {
  const gh = fakeGitHub({ currentSha: 'SHA_OLD' });
  const r = await publishContent({ brand: 'mentolder', domain: 'faq', payload: validFaq, baseSha: 'SHA_OLD', editor: 'a@b', client: gh });
  expect(r.ok).toBe(true);
  expect(gh.branchName).toMatch(/^content\/mentolder-faq-\d+$/);
  expect(gh.autoMergeEnabled).toBe(true);
});

it('returns 422 on schema-invalid payload', async () => {
  const gh = fakeGitHub({ currentSha: 'SHA_OLD' });
  const r = await publishContent({ brand: 'mentolder', domain: 'faq', payload: [{ nope: 1 }], baseSha: 'SHA_OLD', editor: 'a@b', client: gh });
  expect(r).toMatchObject({ ok: false, status: 422 });
});
```

(`fakeGitHub` is a local test helper implementing `GitHubClient` and recording branch/PR/auto-merge calls.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --dir website vitest run src/lib/__tests__/content-publish.test.ts`
Expected: FAIL — `content-publish` module missing.

- [ ] **Step 3: Implement `content-publish.ts`** with the branch/PR/auto-merge flow and blob-SHA concurrency exactly as in the Interfaces block; the created branch name is literally `content/<brand>-<domain>-<Date.now()>` so it matches the test regex `^content\/mentolder-faq-\d+$`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --dir website vitest run src/lib/__tests__/content-publish.test.ts`
Expected: PASS (branch-name regex, 409, and 422 branches all covered).

- [ ] **Step 5: Commit** — `feat(website): content publish pipeline via bot PR [T001490]`

---

## Task 7: Route admin save endpoints through the publish pipeline

**Files:**
- Modify: `website/src/pages/api/admin/homepage/save.ts` and the other content `save.ts` endpoints under `website/src/pages/api/admin/**` (faq, kontakt, uebermich, footer, navigation, stammdaten, seo, referenzen, startseite, kore-flags, leistungen/services)
- Modify: the corresponding Svelte/React editors to show PR-status feedback + keep a `localStorage` draft
- Test: `website/src/pages/api/admin/__tests__/save-publish.test.ts`

**Interfaces:**
- Consumes: `publishContent` from Task 6; `getSession`/`isAdmin` from `website/src/lib/auth` (unchanged auth boundary — admin only).
- Produces: each `save.ts` validates via Zod, calls `publishContent`, and maps results to HTTP (200 with `{ sha, prNumber, prUrl }`, 409 `{ currentSha, currentValue }`, 422 `{ errors }`, 401 unauth). No writes to `site_settings` / `homepage_block_documents`.

- [ ] **Step 1: Write the failing test**

```ts
// website/src/pages/api/admin/__tests__/save-publish.test.ts
it('homepage save publishes via PR and returns the new sha, not a DB version', async () => {
  const res = await POST({ request: reqWithAdminSession(validDoc), locals } as any);
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.sha).toBeTypeOf('string');
  expect(body.prUrl).toMatch(/\/pull\//);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --dir website vitest run src/pages/api/admin/__tests__/save-publish.test.ts`
Expected: FAIL — current `save.ts` calls `save()` against the DB and returns `{ version }`.

- [ ] **Step 3: Rewire endpoints + editor UX**

Replace the DB `save()` call with `publishContent`; surface a "PR #… created, live in ~10 min" status and persist a `localStorage` draft in the editors to survive publish latency. Keep the 409 semantics (now blob-SHA based).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --dir website vitest run src/pages/api/admin/__tests__/save-publish.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** — `feat(website): admin saves publish content via bot PR [T001490]`

---

## Task 8: BATS + Playwright acceptance

**Files:**
- Modify: `tests/spec/website-core.bats` (add content-bundle completeness + decoupling assertions)
- Create/extend: Playwright smoke in `tests/e2e/` covering public pages of both brands with the DB stopped
- Modify: `website/src/data/test-inventory.json` (regenerated)

**Interfaces:**
- Consumes: the seeded `website/content/<brand>/*.json`, the `content-bundle` loader, and a `shared-db`-scaled-to-0 cluster state (k3d) for the Playwright smoke.

- [ ] **Step 1: Add the BATS completeness assertions (RED)**

Assert each brand directory holds all 13 domain files and that `website-db.ts` no longer exports the deleted content readers (grep `getHomepageContent` absent). Run:
Run: `bats tests/spec/website-core.bats -f 'content bundle'`
Expected: FAIL before Tasks 3/4 land; PASS once content is seeded and readers deleted.

- [ ] **Step 2: Add the Playwright smoke**

Scale `shared-db` to 0, then assert `/`, `/leistungen`, `/faq`, `/kontakt` render HTTP 200 with brand content for both `mentolder` and `korczewski`. This is the decoupling acceptance test.

- [ ] **Step 3: Regenerate the test inventory**

Run: `task test:inventory`
Then commit `website/src/data/test-inventory.json`.

- [ ] **Step 4: Commit** — `test(website): bundle completeness + db-down smoke [T001490]`

---

## Task 9: PRIMARY_FRONTEND switch + fine-grained token secret

**Files:**
- Modify: `environments/schema.yaml` (add `PRIMARY_FRONTEND` env var, `validate: "^(astro|react)$"`, and a `GITHUB_CONTENT_TOKEN` entry under `secrets:`)
- Modify: `environments/mentolder.yaml`, `environments/korczewski.yaml` (`PRIMARY_FRONTEND: astro`)
- Modify: `k3d/website.yaml` + its `kustomization.yaml` reference (evaluate the switch for the apex `Host()` route via envsubst) and register any new manifest (S4)
- Create: `k3d/website-content-token-secret.yaml` (dev placeholder), referenced from the relevant `kustomization.yaml`
- Modify: `Taskfile.yml` envsubst var lists to include `$PRIMARY_FRONTEND`

**Interfaces:**
- Consumes: `env-resolve.sh` exported vars; `task env:seal ENV=<env>` for the fine-grained token.
- Produces: the apex IngressRoute host routes to the Astro or React deployment based on `PRIMARY_FRONTEND`; both share the content + `/api/homepage` contract. The GitHub token is delivered as a SealedSecret and mounted into the website deployment as `GITHUB_CONTENT_TOKEN`.

- [ ] **Step 1: Write the failing test (RED)**

Add to `tests/spec/website-core.bats`:
```bash
@test "PRIMARY_FRONTEND is schema-validated and set for both brands" {
  grep -q 'PRIMARY_FRONTEND' environments/schema.yaml
  grep -q 'PRIMARY_FRONTEND' environments/mentolder.yaml
  grep -q 'PRIMARY_FRONTEND' environments/korczewski.yaml
  run bash scripts/env-resolve.sh mentolder
  [ "$status" -eq 0 ]
}
```
Run: `bats tests/spec/website-core.bats -f PRIMARY_FRONTEND`
Expected: FAIL — key not present yet.

- [ ] **Step 2: Add the schema entry + brand values + overlay evaluation**

Add `PRIMARY_FRONTEND` to `schema.yaml` with the `^(astro|react)$` pattern and `default_dev: astro`; set it in both brand env files; wire the envsubst var and the conditional apex `Host()` route in `k3d/website.yaml`. Add the `GITHUB_CONTENT_TOKEN` secret to `schema.yaml` `secrets:` and provide the dev secret manifest + SealedSecret path.

- [ ] **Step 3: Validate**

Run: `task env:validate ENV=mentolder && task env:validate ENV=korczewski && task workspace:validate`
Expected: PASS.

- [ ] **Step 4: Commit** — `feat(infra): PRIMARY_FRONTEND switch + content token secret [T001490]`

---

## Task 10: Legacy table decommission + interfaces spec authoring

**Files:**
- Modify: `website/src/lib/homepage-blocks-store.ts` (Budget 402 — retire the runtime content read/write against `homepage_block_documents`/`homepage_block_versions`; store stays admin-only or `/api/homepage` becomes bundle-sourced) and remove the `site_settings` content-key writes
- Author (at archive): the new SSOT spec `openspec/specs/website-interfaces.md` via `bash scripts/openspec.sh archive website-db-decouple --create-new` — Content-Contract, fail-soft Public-API, Admin-API, Auth boundary, Infra/env switch
- Modify: `website/CLAUDE.md` / `website/WEBSITE-STANDARDS.md` note on the git-content SSOT + publish latency

**Interfaces:**
- Consumes: the now-live bundle + publish pipeline (Tasks 4–7) so nothing reads the retired tables at runtime.
- Produces: a documented decommission (tables left in place for one release, reads/writes removed) and the `website-interfaces` SSOT capturing the exchangeable-frontend contract. The delta in `specs/website-core.md` merges into `website-core` on archive; `website-interfaces` is created fresh with `--create-new`.

- [ ] **Step 1: Assert no runtime content write hits the retired tables**

Extend the save-publish test to assert the `pg` client is never called with `homepage_block_documents` / `site_settings` content inserts on the content path.
Run: `pnpm --dir website vitest run src/pages/api/admin/__tests__/save-publish.test.ts`
Expected: FAIL until the store write is retired.

- [ ] **Step 2: Retire the content DB path + author docs**

Remove the content read/write from `homepage-blocks-store.ts` (make `/api/homepage` bundle-sourced; keep the store admin-only if still referenced), delete the `site_settings` content-key writes, and add the SSOT/publish-latency docs note.

- [ ] **Step 3: Run to verify it passes**

Run: `pnpm --dir website vitest run src/pages/api/admin/__tests__/save-publish.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit** — `chore(website): retire legacy content tables + interfaces doc [T001490]`

---

## Task 11: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Regenerate the test inventory after all test changes**

Run: `task test:inventory`
Then commit `website/src/data/test-inventory.json` if it changed.

- [ ] **Step 2: Run the OpenSpec validation gate**

Run: `task test:openspec` (or `bash scripts/openspec.sh validate`)
Expected: PASS — the change and the `website-core` delta validate.

- [ ] **Step 3: Run the mandatory CI-equivalent gates**

Run:
```bash
task test:changed
task freshness:regenerate
task freshness:check
```
Expected: all PASS — targeted Vitest/BATS green, generated artifacts current, S1–S4 ratchet + baseline key-count assertion pass (`website-db.ts` net-shrunk, `content.ts`/`index.astro`/`mentolder.ts` within budget, no new baseline keys, no new `any`).

- [ ] **Step 4: Manifest validation**

Run: `task workspace:validate`
Expected: PASS.

- [ ] **Step 5: Final commit** — `chore(website): freshness + inventory regen [T001490]`
