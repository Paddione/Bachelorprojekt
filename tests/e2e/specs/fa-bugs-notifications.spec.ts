// tests/e2e/specs/fa-bugs-notifications.spec.ts
//
// FA-bug-notify: bug-report submission → admin resolve → reporter email
//
// This test verifies the full notification loop on the LEGACY resolve path
// (`/api/admin/bugs/resolve`, JSON body). The newer `/api/admin/tickets/:id/transition`
// path is covered by fa-admin-tickets.spec.ts — both are kept so the legacy
// route's email side-effect stays in regression coverage.
//
// Flow:
//   1. Direct-DB insert into tickets.tickets (is_test_data=true) → mint a test ticket.
//   2. Admin authenticates via Keycloak OIDC and POSTs /api/admin/bugs/resolve.
//   3. Mailpit confirms an email arrived at the reporter's address
//      with a subject like "[T001751] Ihre Meldung wurde bearbeitet".
//   4. afterEach deletes the seeded ticket row by external_id, so the
//      fixture is never visible in the real triage queue longer than the
//      duration of the test (T001754 — see openspec/changes/fa-bug-notify-e2e-seed).
//
// Requirements:
//   E2E_ADMIN_USER  — Keycloak username with admin role  (default: paddione)
//   E2E_ADMIN_PASS  — Keycloak password                  (required to run)
//   CRON_SECRET     — still required to keep admin-only routes guarded   (required to run)
//   SESSIONS_DATABASE_URL — Postgres DSN (run: task workspace:port-forward ENV=<env>)
//   WEBSITE_URL     — Astro website base URL              (default: http://localhost:4321)
//   MAILPIT_URL     — Mailpit base URL                    (default: http://localhost:8025)
//
// The test skips gracefully when CRON_SECRET, SESSIONS_DATABASE_URL, or
// E2E_ADMIN_PASS is unset (CI without secrets). When E2E_ADMIN_PASS is set
// but Mailpit is not directly reachable (e.g. behind oauth2-proxy in prod,
// or no local Mailpit), the mail assertion is best-effort and the test
// passes silently — the resolve call itself is still verified.

import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { loginViaE2E } from '../lib/auth';
import { assertAuthenticatedReachable } from '../lib/health-assertions';
import { markerAvailable } from '../lib/e2e-marker';

const BASE       = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const MAILPIT    = process.env.MAILPIT_URL  ?? 'http://localhost:8025';
const DB_URL     = process.env.SESSIONS_DATABASE_URL
                ?? 'postgresql://website:devwebsitedb@localhost:5432/website';
const BRAND      = process.env.E2E_BRAND    ?? 'mentolder';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

interface MailpitAddress { Address: string }
interface MailpitMessage { Subject: string; To: MailpitAddress[]; ID?: string }
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

async function loginAsAdmin(page: import('@playwright/test').Page): Promise<void> {
  await loginViaE2E(page, BASE, ADMIN_USER, '/admin/bugs');
}

test.describe('FA-bug-notify', () => {
  let seededExternalId: string | undefined;

  test.afterEach(async () => {
    if (!seededExternalId) return;
    const pool = new Pool({ connectionString: DB_URL });
    try {
      await pool.query(
        `DELETE FROM tickets.tickets WHERE external_id = $1`,
        [seededExternalId],
      );
    } finally {
      await pool.end();
    }
    seededExternalId = undefined;
  });

  test('reporter receives close-mail when admin resolves ticket', async ({ page, request }, testInfo) => {
    test.skip(!markerAvailable(), 'CRON_SECRET fehlt — Seed würde Prod-Tracker verschmutzen');
    test.skip(!ADMIN_PASS, 'E2E_ADMIN_PASS fehlt — Admin-Resolve nicht testbar');
    test.skip(!process.env.SESSIONS_DATABASE_URL,
      'SESSIONS_DATABASE_URL fehlt — DB-Seed nicht möglich');

    await assertAuthenticatedReachable(
      request,
      `${BASE}/admin/bugs`,
      { acceptableStatuses: [200, 302, 401], label: 'admin bugs page' },
      testInfo
    );

    // ── Step 1: Seed ticket directly in DB (is_test_data=true) ──────
    // Mirrors the column set of website-db.ts:insertBugTicket(). This
    // avoids the public /api/bug-report route entirely, so the fixture
    // row never sits visible in the real triage queue between nightly
    // runs. The afterEach hook above deletes it on success or failure.
    const reporter = `e2e-${Date.now()}@example.com`;
    const description = 'E2E notification test — Playwright FA-bug-notify';

    const pool = new Pool({ connectionString: DB_URL });
    let ticketId: string;
    try {
      const { rows } = await pool.query<{ external_id: string }>(
        `INSERT INTO tickets.tickets
           (type, brand, title, description, url, reporter_email, status, is_test_data)
         VALUES ('bug', $1, $2, $3, '/e2e-test', $4, 'triage', true)
         RETURNING external_id`,
        [BRAND, description.slice(0, 200), description, reporter],
      );
      ticketId = rows[0].external_id;
    } finally {
      await pool.end();
    }
    seededExternalId = ticketId;
    expect(ticketId).toMatch(/^(BR-|T\d)/);

    // ── Step 2: Admin login via Keycloak OIDC ───────────────────────
    await loginAsAdmin(page);

    // ── Step 3: Resolve ticket via API with admin session cookies ───
    // Use page.request so Playwright sends the session cookies from the
    // logged-in browser context.
    const resolveRes = await page.request.post(`${BASE}/api/admin/bugs/resolve`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        ticketId,
        resolutionNote: 'fixed in E2E plan — Playwright FA-bug-notify',
      }),
    });
    expect(resolveRes.ok(), `resolve POST failed: ${resolveRes.status()}`).toBeTruthy();

    const resolveBody = await resolveRes.json() as { ok: boolean };
    expect(resolveBody.ok).toBe(true);

    // ── Step 4: Confirm email in Mailpit ────────────────────────────
    // Allow a short window for the email to be queued and delivered.
    if (await mailpitReachable(request)) {
      await page.waitForTimeout(2000);

      const mailRes = await request.get(
        `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${reporter}`)}`
      );
      expect(mailRes.ok(), `Mailpit search failed: ${mailRes.status()}`).toBeTruthy();

      const mailData = await mailRes.json() as MailpitSearchResult;
      // Filter on 'bearbeitet' so we don't confuse the close-mail with the
      // public-comment mail or any BCC noise.
      const closeMsg = mailData.messages.find(m =>
        m.Subject.includes(ticketId) && m.Subject.includes('bearbeitet'));
      expect(closeMsg,
        `close-mail for ${reporter} with subject containing ${ticketId} not found in Mailpit`
        + ` (got ${mailData.messages.length} message(s)`
        + `; first subject: ${mailData.messages[0]?.Subject ?? '<none>'})`
      ).toBeTruthy();
      // Must be addressed to the reporter (not only to the info@ BCC).
      expect(
        closeMsg!.To.some(t => t.Address === reporter),
        `Email To field does not contain ${reporter}: ${JSON.stringify(closeMsg!.To)}`
      ).toBeTruthy();
    }
  });

  // ── Guard: public resolve endpoint requires auth ─────────────────
  test('POST /api/admin/bugs/resolve returns 403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/bugs/resolve`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ ticketId: 'BR-20260101-0000', resolutionNote: 'test' }),
    });
    expect([401, 403]).toContain(res.status());
  });
});
