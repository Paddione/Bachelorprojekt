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
