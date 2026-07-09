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
//   1. Public bug-report POST /api/bug-report (no auth) → mint a test ticket.
//   2. Admin authenticates via Keycloak OIDC and POSTs /api/admin/bugs/resolve.
//   3. Mailpit confirms an email arrived at the reporter's address
//      with a subject like "[T001751] Ihre Meldung wurde bearbeitet".
//
// Requirements:
//   E2E_ADMIN_USER  — Keycloak username with admin role  (default: paddione)
//   E2E_ADMIN_PASS  — Keycloak password                  (required to run)
//   CRON_SECRET     — seals the e2e-marker on /api/bug-report (required to run)
//   WEBSITE_URL     — Astro website base URL              (default: http://localhost:4321)
//   MAILPIT_URL     — Mailpit base URL                    (default: http://localhost:8025)
//
// The test skips gracefully when CRON_SECRET or E2E_ADMIN_PASS is unset
// (CI without secrets). When E2E_ADMIN_PASS is set but Mailpit is not
// directly reachable (e.g. behind oauth2-proxy in prod, or no local Mailpit),
// the mail assertion is best-effort and the test passes silently — the
// resolve call itself is still verified.

import { test, expect } from '@playwright/test';
import { assertAuthenticatedReachable } from '../lib/health-assertions';
import { createTestBugReport, markerAvailable } from '../lib/e2e-marker';

const BASE       = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const MAILPIT    = process.env.MAILPIT_URL  ?? 'http://localhost:8025';
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
  await page.goto(`${BASE}/api/auth/login?returnTo=/admin/bugs`);
  await page.waitForURL(/realms\/workspace/, { timeout: 60_000 });
  await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
  await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS!);
  await page.locator('#kc-login, input[type="submit"]').first().click();
  // /admin/bugs is a 301 redirect to /admin/tickets; both match /\/admin/.
  await page.waitForURL(/\/admin/, { timeout: 60_000 });
}

test.describe('FA-bug-notify', () => {
  test('reporter receives close-mail when admin resolves ticket', async ({ page, request }, testInfo) => {
    test.skip(!markerAvailable(), 'CRON_SECRET fehlt — Seed würde Prod-Tracker verschmutzen');
    test.skip(!ADMIN_PASS, 'E2E_ADMIN_PASS fehlt — Admin-Resolve nicht testbar');

    await assertAuthenticatedReachable(
      request,
      `${BASE}/admin/bugs`,
      { acceptableStatuses: [200, 302, 401], label: 'admin bugs page' },
      testInfo
    );

    // ── Step 1: Submit public bug report via API (no auth required) ──
    const reporter = `e2e-${Date.now()}@example.com`;
    const { ticketId } = await createTestBugReport(request, {
      description: 'E2E notification test — Playwright FA-bug-notify',
      email:       reporter,
      category:    'fehler',
      url:         '/e2e-test',
    });
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
