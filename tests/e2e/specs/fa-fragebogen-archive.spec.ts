// tests/e2e/specs/fa-fragebogen-archive.spec.ts
//
// FA: Fragebogen archive → reassign → replay
//
// Covers:
//   1. Archive via UI turns a submitted assignment into a frozen datapoint
//      (snapshot row + KPI view populated); reassign creates a new pending row.
//   2. Replay button is visible on archived system-test assignments with evidence.
//
// Skips gracefully when E2E_ADMIN_PASS is unset (CI without secrets).

import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';

const BASE       = process.env.WEBSITE_URL         ?? 'http://localhost:4321';
const DB_URL     = process.env.SESSIONS_DATABASE_URL
                || 'postgresql://website:devwebsitedb@localhost:5432/website';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

async function loginAsAdmin(page: Page, returnTo: string): Promise<void> {
  await page.goto(`${BASE}/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.waitForURL(/realms\/workspace/, { timeout: 20_000 });
  await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
  await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS!);
  await page.locator('#kc-login, input[type="submit"]').first().click();
  await page.waitForURL(new RegExp(returnTo.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&')), { timeout: 20_000 });
}

test.describe('FA: Fragebogen archive → reassign → replay', () => {
  const createdTemplateIds: string[] = [];

  test.beforeEach(({ }, testInfo) => {
    if (!ADMIN_PASS) {
      testInfo.skip(true, 'E2E_ADMIN_PASS not set — skipping admin-required archive specs');
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

  test('archive turns submitted into frozen datapoint; reassign creates new row', async ({ page }) => {
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

    // Archive via UI
    page.on('dialog', dlg => dlg.accept());
    await expect(page.locator('#archive-btn')).toBeVisible({ timeout: 10_000 });
    await page.click('#archive-btn');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Archiviert').first()).toBeVisible({ timeout: 10_000 });

    // Snapshot row exists
    const pool2 = new Pool({ connectionString: DB_URL });
    const snap = await pool2.query(
      `SELECT count(*)::int AS n FROM questionnaire_assignment_scores WHERE assignment_id = $1`,
      [a],
    );
    expect(snap.rows[0].n).toBe(1);

    // KPI view returns the archived row
    const kpi = await pool2.query(
      `SELECT assignment_id, dimension_name, final_score, level
         FROM bachelorprojekt.v_questionnaire_kpi
        WHERE assignment_id = $1`,
      [a],
    );
    expect(kpi.rows.length).toBe(1);
    expect(kpi.rows[0].dimension_name).toBe('D');
    expect(kpi.rows[0].final_score).toBe(4);

    // Reassign — confirms via dialog, navigates to new wizard
    await expect(page.locator('[data-testid="reassign-questionnaire"]')).toBeVisible({ timeout: 10_000 });
    await page.click('[data-testid="reassign-questionnaire"]');
    await page.waitForURL(/\/portal\/fragebogen\/[0-9a-f-]+/, { timeout: 20_000 });
    const newId = page.url().split('/').pop()!.split('?')[0];
    expect(newId).not.toBe(a);

    // Source preserved, new row pending
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

  test('replay button surfaces and shows attempt number for archived system-test with evidence', async ({ page }) => {
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
