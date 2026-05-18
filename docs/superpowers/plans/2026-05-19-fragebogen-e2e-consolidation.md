# Fragebogen E2E Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace two scattered/dead questionnaire Playwright specs with one canonical `fa-fragebogen.spec.ts`, and register 7 other orphaned spec files in `playwright.config.ts` so they actually run in CI.

**Architecture:** The new spec is a single file with five ordered `describe` blocks: auth-gating (headless), fill-flow (DB-seeded), admin-view (admin login), archive/reassign/replay (ported from dead spec), and real-user handoff (prod-only assignment creation). All groups skip gracefully when `E2E_ADMIN_PASS` is unset. DB cleanup uses `is_test_data = true` on seeded rows.

**Tech Stack:** Playwright, TypeScript, `pg` (Pool for DB seeding/cleanup), Keycloak OIDC login via browser, existing `questionnaire-db` schema.

---

## File Map

| Action | Path |
|--------|------|
| Create | `tests/e2e/specs/fa-fragebogen.spec.ts` |
| Delete | `tests/e2e/specs/fa-questionnaire.spec.ts` |
| Delete | `tests/e2e/specs/fa-fragebogen-archive.spec.ts` |
| Modify | `tests/e2e/playwright.config.ts` |

---

## Task 1: Create `fa-fragebogen.spec.ts` — auth gating + fill flow

**Files:**
- Create: `tests/e2e/specs/fa-fragebogen.spec.ts`

- [ ] **Step 1: Create the file with auth-gating and fill-flow groups**

```typescript
// tests/e2e/specs/fa-fragebogen.spec.ts
import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';

const BASE       = process.env.WEBSITE_URL         ?? 'http://localhost:4321';
const DB_URL     = process.env.SESSIONS_DATABASE_URL
                || 'postgresql://website:devwebsitedb@localhost:5432/website';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'p.korczewski@gmail.com';

const isProd = BASE.includes('mentolder.de') || BASE.includes('korczewski.de');

async function loginAsAdmin(page: Page, returnTo: string): Promise<void> {
  await page.goto(`${BASE}/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.waitForURL(/realms\/workspace/, { timeout: 20_000 });
  await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
  await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS!);
  await page.locator('#kc-login, input[type="submit"]').first().click();
  await page.waitForURL(new RegExp(returnTo.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&')), { timeout: 20_000 });
}

// ── Auth gating ─────────────────────────────────────────────────────────────

test.describe('FA-Fragebogen: Auth gating', () => {
  test('GET /api/portal/questionnaires → 401/403', async ({ request }) => {
    const res = await request.get(`${BASE}/api/portal/questionnaires`);
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/portal/questionnaires/:id → 401/403', async ({ request }) => {
    const res = await request.get(`${BASE}/api/portal/questionnaires/test-id`);
    expect([401, 403]).toContain(res.status());
  });

  test('PUT /api/portal/questionnaires/:id/answer → 401/403', async ({ request }) => {
    const res = await request.put(`${BASE}/api/portal/questionnaires/test-id/answer`, {
      data: { question_id: 'q1', option_key: 'test' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/portal/questionnaires/:id/submit → 401/403', async ({ request }) => {
    const res = await request.post(`${BASE}/api/portal/questionnaires/test-id/submit`, {
      data: {},
    });
    expect([401, 403]).toContain(res.status());
  });

  test('/portal/fragebogen/:id redirects unauthenticated (no 404)', async ({ page }) => {
    await page.goto(`${BASE}/portal/fragebogen/test-assignment-id`);
    await expect(page).not.toHaveURL(/\/portal\/fragebogen/);
    await expect(page.locator('body')).not.toContainText('404');
  });

  test('/portal?section=fragebögen → not 404 / not 500', async ({ page }) => {
    const res = await page.goto(`${BASE}/portal?section=fragebögen`);
    await expect(page.locator('body')).not.toContainText('404');
    expect(res?.status()).not.toBe(500);
  });
});

// ── Fill flow ────────────────────────────────────────────────────────────────

test.describe('FA-Fragebogen: Fill flow', () => {
  const createdTemplateIds: string[] = [];

  test.beforeEach(({ }, testInfo) => {
    if (!ADMIN_PASS) testInfo.skip(true, 'E2E_ADMIN_PASS not set');
  });

  test.afterAll(async () => {
    if (createdTemplateIds.length === 0) return;
    const pool = new Pool({ connectionString: DB_URL });
    try {
      await pool.query(
        `DELETE FROM questionnaire_templates WHERE id = ANY($1::uuid[])`,
        [createdTemplateIds],
      );
    } finally {
      await pool.end();
    }
  });

  test('T1: /portal/fragebogen/:id redirects unauthenticated', async ({ page }) => {
    const pool = new Pool({ connectionString: DB_URL });
    const tpl = (await pool.query(
      `INSERT INTO questionnaire_templates (title, description, instructions, status)
       VALUES ('e2e-fill-flow', '', '', 'published') RETURNING id`,
    )).rows[0].id as string;
    createdTemplateIds.push(tpl);
    const customerId = (await pool.query(`SELECT gen_random_uuid() AS u`)).rows[0].u;
    const a = (await pool.query(
      `INSERT INTO questionnaire_assignments (customer_id, template_id, status, is_test_data)
       VALUES ($1, $2, 'pending', true) RETURNING id`,
      [customerId, tpl],
    )).rows[0].id;
    await pool.end();

    await page.goto(`${BASE}/portal/fragebogen/${a}`);
    await expect(page).not.toHaveURL(new RegExp(`/portal/fragebogen/${a}`));
    await expect(page.locator('body')).not.toContainText('404');
  });

  test('T2: PUT answer returns 200 (admin auth, test assignment)', async ({ page, request }) => {
    const pool = new Pool({ connectionString: DB_URL });
    const tpl = (await pool.query(
      `INSERT INTO questionnaire_templates (title, description, instructions, status)
       VALUES ('e2e-fill-answer', '', '', 'published') RETURNING id`,
    )).rows[0].id as string;
    createdTemplateIds.push(tpl);
    const q = (await pool.query(
      `INSERT INTO questionnaire_questions (template_id, position, question_text, question_type)
       VALUES ($1, 0, 'How are you?', 'likert_5') RETURNING id`,
      [tpl],
    )).rows[0].id as string;
    await pool.query(
      `INSERT INTO questionnaire_answer_options (question_id, option_key, label, weight)
       VALUES ($1, '3', 'Neutral', 0)`,
      [q],
    );
    const customerId = (await pool.query(`SELECT gen_random_uuid() AS u`)).rows[0].u;
    const a = (await pool.query(
      `INSERT INTO questionnaire_assignments (customer_id, template_id, status, is_test_data)
       VALUES ($1, $2, 'pending', true) RETURNING id`,
      [customerId, tpl],
    )).rows[0].id as string;
    await pool.end();

    // Establish admin session so the request context inherits cookies
    await loginAsAdmin(page, '/portal');
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const res = await request.put(`${BASE}/api/portal/questionnaires/${a}/answer`, {
      data: { question_id: q, option_key: '3' },
      headers: { Cookie: cookieHeader },
    });
    expect(res.status()).toBe(200);
  });

  test('T3: POST submit → status becomes submitted', async ({ page, request }) => {
    const pool = new Pool({ connectionString: DB_URL });
    const tpl = (await pool.query(
      `INSERT INTO questionnaire_templates (title, description, instructions, status)
       VALUES ('e2e-fill-submit', '', '', 'published') RETURNING id`,
    )).rows[0].id as string;
    createdTemplateIds.push(tpl);
    const customerId = (await pool.query(`SELECT gen_random_uuid() AS u`)).rows[0].u;
    const a = (await pool.query(
      `INSERT INTO questionnaire_assignments (customer_id, template_id, status, is_test_data)
       VALUES ($1, $2, 'in_progress', true) RETURNING id`,
      [customerId, tpl],
    )).rows[0].id as string;
    await pool.end();

    await loginAsAdmin(page, '/portal');
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const res = await request.post(`${BASE}/api/portal/questionnaires/${a}/submit`, {
      data: {},
      headers: { Cookie: cookieHeader },
    });
    expect(res.status()).toBe(200);

    const pool2 = new Pool({ connectionString: DB_URL });
    const row = await pool2.query(`SELECT status FROM questionnaire_assignments WHERE id = $1`, [a]);
    await pool2.end();
    expect(row.rows[0].status).toBe('submitted');
  });
});
```

- [ ] **Step 2: Verify the file is syntactically valid**

```bash
cd tests/e2e && npx tsc --noEmit --project tsconfig.json 2>&1 | head -20
```

Expected: no errors (or only pre-existing unrelated errors).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/specs/fa-fragebogen.spec.ts
git commit -m "test(fragebogen): add auth-gating + fill-flow groups to consolidated spec"
```

---

## Task 2: Add admin-view, archive, and real-user handoff groups

**Files:**
- Modify: `tests/e2e/specs/fa-fragebogen.spec.ts`

- [ ] **Step 1: Append the three remaining groups to the file**

```typescript
// ── Admin view ───────────────────────────────────────────────────────────────

test.describe('FA-Fragebogen: Admin view', () => {
  const createdTemplateIds: string[] = [];

  test.beforeEach(({ }, testInfo) => {
    if (!ADMIN_PASS) testInfo.skip(true, 'E2E_ADMIN_PASS not set');
  });

  test.afterAll(async () => {
    if (createdTemplateIds.length === 0) return;
    const pool = new Pool({ connectionString: DB_URL });
    try {
      await pool.query(
        `DELETE FROM questionnaire_templates WHERE id = ANY($1::uuid[])`,
        [createdTemplateIds],
      );
    } finally {
      await pool.end();
    }
  });

  test('T1: /admin/fragebogen/:id shows submitted data (no 404/500)', async ({ page }) => {
    const pool = new Pool({ connectionString: DB_URL });
    const tpl = (await pool.query(
      `INSERT INTO questionnaire_templates (title, description, instructions, status)
       VALUES ('e2e-admin-view', '', '', 'published') RETURNING id`,
    )).rows[0].id as string;
    createdTemplateIds.push(tpl);
    const customerId = (await pool.query(`SELECT gen_random_uuid() AS u`)).rows[0].u;
    const a = (await pool.query(
      `INSERT INTO questionnaire_assignments (customer_id, template_id, status, submitted_at, is_test_data)
       VALUES ($1, $2, 'submitted', now(), true) RETURNING id`,
      [customerId, tpl],
    )).rows[0].id as string;
    await pool.end();

    await loginAsAdmin(page, `/admin/fragebogen/${a}`);
    await expect(page.locator('body')).not.toContainText('404');
    const res = await page.evaluate(() => window.performance
      .getEntriesByType('navigation')
      .map((e) => (e as PerformanceNavigationTiming).responseStatus)[0]
    );
    expect(res).not.toBe(500);
  });
});

// ── Archive → reassign → replay ──────────────────────────────────────────────
// Ported from fa-fragebogen-archive.spec.ts (previously unregistered)

test.describe('FA-Fragebogen: Archive → reassign → replay', () => {
  const createdTemplateIds: string[] = [];

  test.beforeEach(({ }, testInfo) => {
    if (!ADMIN_PASS) testInfo.skip(true, 'E2E_ADMIN_PASS not set');
  });

  test.afterAll(async () => {
    if (createdTemplateIds.length === 0) return;
    const pool = new Pool({ connectionString: DB_URL });
    try {
      await pool.query(
        `DELETE FROM questionnaire_templates WHERE id = ANY($1::uuid[])`,
        [createdTemplateIds],
      );
    } finally {
      await pool.end();
    }
  });

  test('T1: archive turns submitted into frozen datapoint; reassign creates new row', async ({ page }) => {
    const pool = new Pool({ connectionString: DB_URL });
    const customerId = (await pool.query(`SELECT gen_random_uuid() AS u`)).rows[0].u;
    const tpl = (await pool.query(
      `INSERT INTO questionnaire_templates (title, description, instructions, status)
       VALUES ('e2e-archive', '', '', 'published') RETURNING id`,
    )).rows[0].id as string;
    createdTemplateIds.push(tpl);
    const dim = (await pool.query(
      `INSERT INTO questionnaire_dimensions (template_id, name, position, threshold_mid, threshold_high)
       VALUES ($1, 'D', 0, 5, 10) RETURNING id`,
      [tpl],
    )).rows[0].id;
    const q = (await pool.query(
      `INSERT INTO questionnaire_questions (template_id, position, question_text, question_type)
       VALUES ($1, 0, 'q', 'likert_5') RETURNING id`,
      [tpl],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO questionnaire_answer_options (question_id, option_key, label, dimension_id, weight)
       VALUES ($1, '4', 'x', $2, 1)`,
      [q, dim],
    );
    const a = (await pool.query(
      `INSERT INTO questionnaire_assignments (customer_id, template_id, status, submitted_at, is_test_data)
       VALUES ($1, $2, 'submitted', now(), true) RETURNING id`,
      [customerId, tpl],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO questionnaire_answers (assignment_id, question_id, option_key)
       VALUES ($1, $2, '4')`,
      [a, q],
    );
    await pool.end();

    await loginAsAdmin(page, `/admin/fragebogen/${a}`);

    page.on('dialog', dlg => dlg.accept());
    await expect(page.locator('#archive-btn')).toBeVisible({ timeout: 10_000 });
    await page.click('#archive-btn');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Archiviert').first()).toBeVisible({ timeout: 10_000 });

    const pool2 = new Pool({ connectionString: DB_URL });
    const snap = await pool2.query(
      `SELECT count(*)::int AS n FROM questionnaire_assignment_scores WHERE assignment_id = $1`,
      [a],
    );
    expect(snap.rows[0].n).toBe(1);

    const kpi = await pool2.query(
      `SELECT assignment_id, dimension_name, final_score, level
         FROM bachelorprojekt.v_questionnaire_kpi
        WHERE assignment_id = $1`,
      [a],
    );
    expect(kpi.rows.length).toBe(1);
    expect(kpi.rows[0].dimension_name).toBe('D');
    expect(kpi.rows[0].final_score).toBe(4);

    await expect(page.locator('[data-testid="reassign-questionnaire"]')).toBeVisible({ timeout: 10_000 });
    await page.click('[data-testid="reassign-questionnaire"]');
    await page.waitForURL(/\/portal\/fragebogen\/[0-9a-f-]+/, { timeout: 20_000 });
    const newId = page.url().split('/').pop()!.split('?')[0];
    expect(newId).not.toBe(a);

    const rows = await pool2.query(
      `SELECT id, status, archived_at FROM questionnaire_assignments
        WHERE customer_id = $1 ORDER BY assigned_at`,
      [customerId],
    );
    expect(rows.rows.length).toBe(2);
    expect(rows.rows[0].status).toBe('archived');
    expect(rows.rows[0].archived_at).not.toBeNull();
    expect(rows.rows[1].status).toBe('pending');
    expect(rows.rows[1].archived_at).toBeNull();

    await pool2.end();
  });

  test('T2: replay button surfaces and shows attempt number for archived system-test with evidence', async ({ page }) => {
    const pool = new Pool({ connectionString: DB_URL });
    const customerId = (await pool.query(`SELECT gen_random_uuid() AS u`)).rows[0].u;
    const tpl = (await pool.query(
      `INSERT INTO questionnaire_templates (title, description, instructions, status, is_system_test)
       VALUES ('e2e-replay', '', '', 'published', true) RETURNING id`,
    )).rows[0].id as string;
    createdTemplateIds.push(tpl);
    const q = (await pool.query(
      `INSERT INTO questionnaire_questions (template_id, position, question_text, question_type)
       VALUES ($1, 0, 'step', 'test_step') RETURNING id`,
      [tpl],
    )).rows[0].id;
    const a = (await pool.query(
      `INSERT INTO questionnaire_assignments (customer_id, template_id, status, submitted_at, archived_at, is_test_data)
       VALUES ($1, $2, 'archived', now(), now(), true) RETURNING id`,
      [customerId, tpl],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO questionnaire_answers (assignment_id, question_id, option_key)
       VALUES ($1, $2, 'erfüllt')`,
      [a, q],
    );
    await pool.query(
      `INSERT INTO questionnaire_test_evidence (assignment_id, question_id, attempt, replay_path)
       VALUES ($1, $2, 0, '/tmp/replay-0')`,
      [a, q],
    );
    await pool.end();

    await loginAsAdmin(page, `/admin/fragebogen/${a}`);

    const replayBtn = page.locator('.replay-btn').first();
    await expect(replayBtn).toBeVisible({ timeout: 10_000 });
    await expect(replayBtn).toContainText('Versuch 0');
  });
});

// ── Real-user handoff ─────────────────────────────────────────────────────────
// After all automated tests pass, creates a pending system-test-4 assignment
// for the admin user in prod so a human can walk through it manually.
// Only runs when WEBSITE_URL points to a prod domain AND E2E_ADMIN_PASS is set.

test.describe('FA-Fragebogen: Real-user handoff', () => {
  test.beforeEach(({ }, testInfo) => {
    if (!ADMIN_PASS) testInfo.skip(true, 'E2E_ADMIN_PASS not set');
    if (!isProd) testInfo.skip(true, 'Real-user handoff only runs against prod (WEBSITE_URL must contain mentolder.de or korczewski.de)');
  });

  test('T1: assign systemtest-04 fragebogen template to admin user in prod', async ({ page }) => {
    // Look up systemtest-4 template and admin KC user ID from DB
    const pool = new Pool({ connectionString: DB_URL });
    const tplRow = await pool.query(
      `SELECT id FROM questionnaire_templates
        WHERE is_system_test = true AND title LIKE 'System-Test 4%'
        ORDER BY created_at DESC LIMIT 1`,
    );
    if (tplRow.rows.length === 0) {
      await pool.end();
      throw new Error('System-Test 4 template not found in prod DB — run task coaching:ingest or seed first');
    }
    const templateId = tplRow.rows[0].id as string;

    const userRow = await pool.query(
      `SELECT keycloak_user_id FROM customers WHERE email = $1 LIMIT 1`,
      [ADMIN_EMAIL],
    );
    await pool.end();

    if (userRow.rows.length === 0 || !userRow.rows[0].keycloak_user_id) {
      throw new Error(`Admin user with email ${ADMIN_EMAIL} not found in customers table — log in at least once first`);
    }
    const keycloakUserId = userRow.rows[0].keycloak_user_id as string;

    // Log in as admin — page.request shares the browser context's cookies automatically
    await loginAsAdmin(page, '/admin/fragebogen');

    const res = await page.request.post(`${BASE}/api/admin/questionnaires/assign`, {
      data: { templateId, keycloakUserId },
    });
    expect(res.status()).toBe(201);

    const body = await res.json() as { id: string };
    const assignmentUrl = `${BASE}/portal/fragebogen/${body.id}`;
    console.log(`\n✅ Real-user handoff complete — walk this URL manually:\n   ${assignmentUrl}\n`);
  });
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd tests/e2e && npx tsc --noEmit --project tsconfig.json 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/specs/fa-fragebogen.spec.ts
git commit -m "test(fragebogen): add admin-view, archive, and real-user handoff groups"
```

---

## Task 3: Update playwright.config.ts + delete old specs

**Files:**
- Modify: `tests/e2e/playwright.config.ts`
- Delete: `tests/e2e/specs/fa-questionnaire.spec.ts`
- Delete: `tests/e2e/specs/fa-fragebogen-archive.spec.ts`

- [ ] **Step 1: In `playwright.config.ts`, replace the questionnaire entry in the `website` project**

In the `website` project `testMatch` array (around line 51), replace:
```typescript
        '**/fa-questionnaire.spec.ts', // Fragebögen
```
with:
```typescript
        '**/fa-fragebogen.spec.ts',           // consolidated questionnaire E2E
        '**/fa-coaching-drafts.spec.ts',      // coaching drafts auth-gates
        '**/fa-coaching-knowledge.spec.ts',   // knowledge collections CRUD
        '**/fa-coaching-publish.spec.ts',     // coaching publish flow
```

- [ ] **Step 2: Add brett specs to the `brett-mentolder` project**

In the `brett-mentolder` project `testMatch` array (around line 120, currently `['**/brett-mayhem.spec.ts']`), change to:
```typescript
      testMatch: [
        '**/brett-mayhem.spec.ts',
        '**/brett-controls.spec.ts',   // WASD movement
        '**/brett-mannequin.spec.ts',  // mannequin focus
      ],
```

- [ ] **Step 3: Add arena specs to the `smoke` project**

In the `smoke` project `testMatch` array (around line 160, currently `['**/integration-smoke.spec.ts']`), change to:
```typescript
      testMatch: [
        '**/integration-smoke.spec.ts',
        '**/fa-30-arena-banner.spec.ts',      // cross-brand arena banner
        '**/fa-38-arena-game-client.spec.ts', // game client lobby flow
      ],
```

- [ ] **Step 4: Delete the two old specs**

```bash
rm tests/e2e/specs/fa-questionnaire.spec.ts
rm tests/e2e/specs/fa-fragebogen-archive.spec.ts
```

- [ ] **Step 5: Verify playwright lists the new spec**

```bash
cd tests/e2e && npx playwright test --project=website --list 2>&1 | grep fragebogen
```

Expected output includes lines like:
```
fa-fragebogen.spec.ts:XX:X › FA-Fragebogen: Auth gating › GET /api/portal/questionnaires → 401/403
```

- [ ] **Step 6: Run auth-gating group headless (no creds needed) to confirm it passes**

```bash
WEBSITE_URL=https://web.mentolder.de npx playwright test \
  --config tests/e2e/playwright.config.ts \
  --project website \
  tests/e2e/specs/fa-fragebogen.spec.ts \
  --grep "Auth gating"
```

Expected: all 6 auth-gating tests PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/playwright.config.ts
git rm tests/e2e/specs/fa-questionnaire.spec.ts
git rm tests/e2e/specs/fa-fragebogen-archive.spec.ts
git commit -m "test(e2e): register consolidated fragebogen spec + 7 orphaned specs in playwright config"
```

---

## Task 4: Update test inventory and final verification

**Files:**
- Modify: `website/src/data/test-inventory.json`

- [ ] **Step 1: Regenerate test inventory**

```bash
task test:inventory
```

Expected: command completes without error.

- [ ] **Step 2: Confirm inventory changed**

```bash
git diff website/src/data/test-inventory.json | head -40
```

Expected: shows `fa-fragebogen` added, `fa-questionnaire` removed.

- [ ] **Step 3: Commit inventory**

```bash
git add website/src/data/test-inventory.json
git commit -m "chore(test-inventory): regenerate after fragebogen spec consolidation"
```

- [ ] **Step 4: Final sanity — list all projects to confirm no orphaned specs remain**

```bash
cd tests/e2e && npx playwright test --list 2>&1 | grep -E "^(No tests|[0-9]+ test)" | tail -3
```

Expected: total test count shown, no "No tests found" message.

- [ ] **Step 5: Push**

```bash
git push
```
