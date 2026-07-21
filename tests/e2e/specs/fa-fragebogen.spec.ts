// tests/e2e/specs/fa-fragebogen.spec.ts
import { test, expect, type Page } from '@playwright/test';
import { assertAuthenticatedReachable } from '../lib/health-assertions';
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
  await page.waitForURL(/authorize/, { timeout: 60_000 });
  await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
  await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS!);
  await page.locator('#kc-login, input[type="submit"]').first().click();
  await page.waitForURL(new RegExp(returnTo.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&')), { timeout: 20_000 });
}

// ── Auth gating ─────────────────────────────────────────────────────────────

test.describe('FA-Fragebogen: Auth gating', { tag: ['@fragebogen'] }, () => {
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

test.describe('FA-Fragebogen: Fill flow', { tag: ['@fragebogen'] }, () => {
  const createdTemplateIds: string[] = [];

  test.beforeEach(async ({ request }, testInfo) => {
    await assertAuthenticatedReachable(
      request,
      `${BASE}/admin`,
      { acceptableStatuses: [200, 302, 401], label: 'admin dashboard' },
      testInfo
    );
    if (isProd && !process.env.SESSIONS_DATABASE_URL) {
      testInfo.skip(true, 'Direct DB access requires SESSIONS_DATABASE_URL (run: task workspace:port-forward ENV=<env>)');
    }
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

// ── Admin view ───────────────────────────────────────────────────────────────

test.describe('FA-Fragebogen: Admin view', { tag: ['@fragebogen'] }, () => {
  const createdTemplateIds: string[] = [];

  test.beforeEach(async ({ request }, testInfo) => {
    await assertAuthenticatedReachable(
      request,
      `${BASE}/admin`,
      { acceptableStatuses: [200, 302, 401], label: 'admin dashboard' },
      testInfo
    );
    if (isProd && !process.env.SESSIONS_DATABASE_URL) {
      testInfo.skip(true, 'Direct DB access requires SESSIONS_DATABASE_URL (run: task workspace:port-forward ENV=<env>)');
    }
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

test.describe('FA-Fragebogen: Archive → reassign → replay', { tag: ['@fragebogen'] }, () => {
  const createdTemplateIds: string[] = [];

  test.beforeEach(async ({ request }, testInfo) => {
    await assertAuthenticatedReachable(
      request,
      `${BASE}/admin`,
      { acceptableStatuses: [200, 302, 401], label: 'admin dashboard' },
      testInfo
    );
    if (isProd && !process.env.SESSIONS_DATABASE_URL) {
      testInfo.skip(true, 'Direct DB access requires SESSIONS_DATABASE_URL (run: task workspace:port-forward ENV=<env>)');
    }
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
    await expect(page.locator('#archive-btn')).toBeVisible({ timeout: 60_000 });
    await page.click('#archive-btn');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Archiviert').first()).toBeVisible({ timeout: 60_000 });

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

    await expect(page.locator('[data-testid="reassign-questionnaire"]')).toBeVisible({ timeout: 60_000 });
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
    await expect(replayBtn).toBeVisible({ timeout: 60_000 });
    await expect(replayBtn).toContainText('Versuch 0');
  });
});

// ── Real-user handoff ─────────────────────────────────────────────────────────
// After all automated tests pass, creates a pending system-test-4 assignment
// for the admin user in prod so a human can walk through it manually.
// Only runs when WEBSITE_URL points to a prod domain AND E2E_ADMIN_PASS is set.

test.describe('FA-Fragebogen: Real-user handoff', { tag: ['@fragebogen'] }, () => {
  test.beforeEach(({ }, testInfo) => {
    if (!ADMIN_PASS) testInfo.skip(true, 'E2E_ADMIN_PASS not set');
    if (!isProd) testInfo.skip(true, 'Real-user handoff only runs against prod (WEBSITE_URL must contain mentolder.de or korczewski.de)');
    if (isProd && !process.env.SESSIONS_DATABASE_URL) {
      testInfo.skip(true, 'Direct DB access requires SESSIONS_DATABASE_URL (run: task workspace:port-forward ENV=<env>)');
    }
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
