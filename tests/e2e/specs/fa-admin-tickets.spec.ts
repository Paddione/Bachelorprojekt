// tests/e2e/specs/fa-admin-tickets.spec.ts
//
// PR4/5 — admin /admin/tickets coverage:
//   1. Filter the index page (status=open + type=bug)
//   2. Open a freshly minted bug ticket via /admin/tickets/:id
//   3. Add an internal comment (POST /api/admin/tickets/:id/comments)
//   4. Add a public comment → reporter receives an email (Mailpit)
//   5. Transition the ticket to done with resolution=fixed →
//      close-mail to reporter (Mailpit subject contains T-ID)
//   6. Verify the activity timeline rendered each event
//
// The test skips gracefully when E2E_ADMIN_PASS is unset (CI without
// secrets) or when the DB-level seed gates fail
// (CRON_SECRET+SESSIONS_DATABASE_URL — see e2e-seed.ts).
//
// Seed strategy (T001749): instead of POSTing api/bug-report (which
// races rate limits, the X-Cron-Secret gate, and the BR→T external_id
// migration), the ticket is INSERTed directly into `tickets.tickets`
// with `is_test_data=true`. The server-side purge sweep
// (`tickets.fn_purge_test_data` / admin/systemtest/cleanup-fixtures.ts)
// reaps it at the next bracket, and `afterEach` deletes it
// immediately so the next test starts clean.

import { test, expect } from '@playwright/test';
import { assertAuthenticatedReachable } from '../lib/health-assertions';
import { seedAdminTicket, cleanupSeedTicket, seedAvailable } from '../lib/e2e-seed';

const BASE       = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const MAILPIT    = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

interface MailpitAddress { Address: string }
interface MailpitMessage { Subject: string; To: MailpitAddress[]; ID: string }
interface MailpitSearchResult { messages: MailpitMessage[] }

/** Returns true only when Mailpit API is directly accessible (not behind auth proxy). */
async function mailpitReachable(request: import('@playwright/test').APIRequestContext): Promise<boolean> {
  try {
    const r = await request.get(`${MAILPIT}/api/v1/messages?limit=1`, { timeout: 5000 });
    return r.ok() && (r.headers()['content-type'] ?? '').includes('application/json');
  } catch {
    return false;
  }
}

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/api/auth/login?returnTo=/admin/tickets`);
  await page.waitForURL(/authorize/, { timeout: 60_000 });
  await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
  await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS!);
  await page.locator('#kc-login, input[type="submit"]').first().click();
  await page.waitForURL(/\/admin\/tickets/, { timeout: 60_000 });
}

test.describe('FA-admin-tickets', { tag: ['@admin'] }, () => {
  test('full flow: filter + comment + transition + timeline', async ({ page, request }, testInfo) => {
    test.skip(!seedAvailable(),
      'CRON_SECRET oder SESSIONS_DATABASE_URL fehlt — DB-Seed würde Prod-Tracker verschmutzen oder scheitern');
    test.skip(!ADMIN_PASS, 'E2E_ADMIN_PASS fehlt — Admin-Login nicht möglich');

    await assertAuthenticatedReachable(
      request,
      `${BASE}/admin/tickets`,
      { acceptableStatuses: [200, 302, 401], label: 'admin tickets' },
      testInfo
    );

    // ── 1. Seed a bug ticket directly in the DB ──
    // T001749: replaced POST api/bug-report (runtime self-seed) with a
    // direct INSERT via e2e-seed.ts. The seeded row is stamped
    // is_test_data=true so the server-side purge sweep reaps it, and
    // the afterEach below deletes it explicitly so subsequent tests
    // start clean.
    const testId = `admin-tickets-${Date.now()}`;
    const seeded = await seedAdminTicket({
      testId,
      description: 'PR4 admin-tickets E2E seed',
      url: '/admin/tickets-e2e',
    });
    const { id: ticketUuid, externalId, reporterEmail: reporter } = seeded;

    try {
      // ── 2. Admin login + index filter ──
      await loginAsAdmin(page);
      await page.goto(`${BASE}/admin/tickets?type=bug&status=open&q=${externalId}`);
      const externalIdLink = page.locator(`a:has-text("${externalId}")`).first();
      await expect(externalIdLink).toBeVisible({ timeout: 60_000 });

      // ── 3. Open detail page ──
      await externalIdLink.click();
      await page.waitForURL(/\/admin\/tickets\/[0-9a-f-]+/, { timeout: 60_000 });
      const detailUrl = page.url();
      expect(ticketUuid).toMatch(/^[0-9a-f-]{36}$/);

      // ── 4. Internal comment ──
      const internalRes = await page.request.post(
        `${BASE}/api/admin/tickets/${ticketUuid}/comments`,
        { headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ body: 'PR4 internal comment', visibility: 'internal' }) });
      expect(internalRes.ok()).toBeTruthy();

      // ── 5. Public comment → reporter mail ──
      const publicRes = await page.request.post(
        `${BASE}/api/admin/tickets/${ticketUuid}/comments`,
        { headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ body: 'PR4 public reply for the reporter', visibility: 'public' }) });
      expect(publicRes.ok()).toBeTruthy();

      const canCheckMail = await mailpitReachable(request);
      if (canCheckMail) {
        await page.waitForTimeout(2000);
        const publicMail = await request.get(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${reporter} subject:${externalId}`)}`);
        expect(publicMail.ok()).toBeTruthy();
        const publicData = await publicMail.json() as MailpitSearchResult;
        expect(publicData.messages.length).toBeGreaterThan(0);
      }

      // ── 6. Transition to done → close-mail ──
      const transRes = await page.request.post(
        `${BASE}/api/admin/tickets/${ticketUuid}/transition`,
        { headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ status: 'done', resolution: 'fixed', note: 'PR4 done', noteVisibility: 'internal' }) });
      expect(transRes.ok()).toBeTruthy();

      if (canCheckMail) {
        await page.waitForTimeout(2000);
        const closeMail = await request.get(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${reporter}`)}`);
        expect(closeMail.ok()).toBeTruthy();
        const closeData = await closeMail.json() as MailpitSearchResult;
        const closeMsg = closeData.messages.find(m =>
          m.Subject.includes(externalId) && m.Subject.includes('bearbeitet'));
        expect(closeMsg, `close-mail with subject containing ${externalId} not found`).toBeTruthy();
      }

      // ── 7. Reload detail and assert the timeline rendered all events ──
      await page.goto(detailUrl);
      // Wait for Astro island hydration before asserting timeline visibility.
      await page.waitForLoadState('networkidle');
      const timelineBody = page.locator('.ticket-timeline');
      await expect(timelineBody).toBeVisible({ timeout: 60_000 });
      await expect(page.locator('.ticket-timeline-comment').first()).toBeVisible();
      // At minimum: created + 2 comments + 1 status change → 4 timeline rows.
      const rowCount = await page.locator('.ticket-timeline-row').count();
      expect(rowCount).toBeGreaterThanOrEqual(4);
    } finally {
      // Always scrub the seeded row — even when assertions fail — so a
      // flaky run doesn't leave dangling test_data=true tickets in the
      // shared schema.
      await cleanupSeedTicket(ticketUuid);
    }
  });

  test('GET /api/admin/tickets returns 403 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/tickets`);
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/tickets/:id/transition returns 403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/tickets/00000000-0000-0000-0000-000000000000/transition`,
      { headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ status: 'done', resolution: 'fixed' }) });
    expect([401, 403]).toContain(res.status());
  });
});
