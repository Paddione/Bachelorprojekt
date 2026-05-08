// tests/e2e/specs/fa-admin-tickets.spec.ts
//
// PR4/5 — admin /admin/tickets coverage:
//   1. Filter the index page (status=open + type=bug)
//   2. Open a freshly minted bug ticket via /admin/tickets/:id
//   3. Add an internal comment (POST /api/admin/tickets/:id/comments)
//   4. Add a public comment → reporter receives an email (Mailpit)
//   5. Transition the ticket to done with resolution=fixed →
//      close-mail to reporter (Mailpit subject contains BR-ID)
//   6. Verify the activity timeline rendered each event
//
// The test skips gracefully when E2E_ADMIN_PASS is unset (CI without secrets).

import { test, expect } from '@playwright/test';

const BASE       = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const MAILPIT    = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'patrick';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

interface MailpitAddress { Address: string }
interface MailpitMessage { Subject: string; To: MailpitAddress[]; ID: string }
interface MailpitSearchResult { messages: MailpitMessage[] }

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/api/auth/login?returnTo=/admin/tickets`);
  await page.waitForURL(/realms\/workspace/, { timeout: 20_000 });
  await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
  await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS!);
  await page.locator('#kc-login, input[type="submit"]').first().click();
  await page.waitForURL(/\/admin\/tickets/, { timeout: 20_000 });
}

test.describe('FA-admin-tickets', () => {
  test('full flow: filter + comment + transition + timeline', async ({ page, request }) => {
    test.skip(!ADMIN_PASS, 'E2E_ADMIN_PASS not set — skipping');

    // ── 1. Mint a public bug as the seed ticket ──
    const reporter = `e2e-tickets-${Date.now()}@example.com`;
    const create = await request.post(`${BASE}/api/bug-report`, {
      multipart: {
        description: 'PR4 admin-tickets E2E seed',
        email:       reporter,
        category:    'fehler',
        url:         '/admin/tickets-e2e',
      },
    });
    expect(create.ok()).toBeTruthy();
    const cb = await create.json() as { success: boolean; ticketId: string };
    expect(cb.ticketId).toMatch(/^T\d{6,}$/);
    const externalId = cb.ticketId;

    // ── 2. Admin login + index filter ──
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/tickets?type=bug&status=open&q=${externalId}`);
    const externalIdLink = page.locator(`a:has-text("${externalId}")`).first();
    await expect(externalIdLink).toBeVisible({ timeout: 10_000 });

    // ── 3. Open detail page ──
    await externalIdLink.click();
    await page.waitForURL(/\/admin\/tickets\/[0-9a-f-]+/, { timeout: 10_000 });
    const detailUrl = page.url();
    const ticketUuid = detailUrl.split('/').pop()!;
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
    await page.waitForTimeout(2000);
    const publicMail = await request.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${reporter} subject:${externalId}`)}`);
    expect(publicMail.ok()).toBeTruthy();
    const publicData = await publicMail.json() as MailpitSearchResult;
    expect(publicData.messages.length).toBeGreaterThan(0);

    // ── 6. Transition to done → close-mail ──
    const transRes = await page.request.post(
      `${BASE}/api/admin/tickets/${ticketUuid}/transition`,
      { headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ status: 'done', resolution: 'fixed', note: 'PR4 done', noteVisibility: 'internal' }) });
    expect(transRes.ok()).toBeTruthy();
    await page.waitForTimeout(2000);
    const closeMail = await request.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${reporter}`)}`);
    expect(closeMail.ok()).toBeTruthy();
    const closeData = await closeMail.json() as MailpitSearchResult;
    const closeMsg = closeData.messages.find(m =>
      m.Subject.includes(externalId) && m.Subject.includes('bearbeitet'));
    expect(closeMsg, `close-mail with subject containing ${externalId} not found`).toBeTruthy();

    // ── 7. Reload detail and assert the timeline rendered all events ──
    await page.goto(detailUrl);
    const timelineBody = page.locator('.ticket-timeline');
    await expect(timelineBody).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.ticket-timeline-comment').first()).toBeVisible();
    // At minimum: created + 2 comments + 1 status change → 4 timeline rows.
    const rowCount = await page.locator('.ticket-timeline-row').count();
    expect(rowCount).toBeGreaterThanOrEqual(4);
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
