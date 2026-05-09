// tests/e2e/specs/fa-bugs-notifications.spec.ts
//
// FA-bug-notify: bug-report submission → admin resolve → reporter email
//
// This test verifies the full notification loop:
//   1. A public bug-report is submitted via POST /api/bug-report (no auth).
//   2. An admin authenticates via Keycloak OIDC and resolves the ticket
//      via POST /api/admin/bugs/resolve (JSON body).
//   3. Mailpit confirms an email arrived at the reporter's address
//      with a subject containing the ticket's BR-ID.
//
// Requirements:
//   E2E_ADMIN_USER  — Keycloak username with admin role  (default: patrick)
//   E2E_ADMIN_PASS  — Keycloak password                  (required to run)
//   WEBSITE_URL     — Astro website base URL              (default: http://localhost:4321)
//   MAILPIT_URL     — Mailpit base URL                    (default: http://localhost:8025)
//
// The test skips gracefully when E2E_ADMIN_PASS is unset (CI without secrets).

import { test, expect } from '@playwright/test';

const BASE       = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const MAILPIT    = process.env.MAILPIT_URL  ?? 'http://localhost:8025';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

test.describe('FA-bug-notify', () => {
  test('reporter receives close-mail when admin resolves ticket', async ({ page, request }) => {
    test.skip(!ADMIN_PASS, 'E2E_ADMIN_PASS not set — skipping (set to enable live run)');

    // ── Step 1: Submit public bug report via API (no auth required) ──
    const reporter = `e2e-${Date.now()}@example.com`;

    const create = await request.post(`${BASE}/api/bug-report`, {
      multipart: {
        description: 'E2E notification test — Playwright FA-bug-notify',
        email:       reporter,
        category:    'fehler',
        url:         '/e2e-test',
      },
    });
    expect(create.ok(), `bug-report POST failed: ${create.status()}`).toBeTruthy();

    const createBody = await create.json() as { success: boolean; ticketId: string };
    expect(createBody.success).toBe(true);
    expect(createBody.ticketId).toMatch(/^(BR-|T\d)/);
    const ticketId = createBody.ticketId;

    // ── Step 2: Admin login via Keycloak OIDC ───────────────────────
    // Navigate to the login redirect — the Astro app redirects to Keycloak.
    await page.goto(`${BASE}/api/auth/login?returnTo=/admin/bugs`);

    // Wait for Keycloak login page (URL contains /realms/workspace)
    await page.waitForURL(/realms\/workspace/, { timeout: 20_000 });

    // Fill Keycloak login form
    const kcUsername = page.locator('#username, input[name="username"]').first();
    const kcPassword = page.locator('#password, input[name="password"]').first();
    await expect(kcUsername).toBeVisible({ timeout: 10_000 });
    await kcUsername.fill(ADMIN_USER);
    await kcPassword.fill(ADMIN_PASS!);
    await page.locator('#kc-login, input[type="submit"]').first().click();

    // Wait for redirect back to the website admin page (OIDC callback can take a moment).
    await page.waitForURL(/\/admin/, { timeout: 30_000 });

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
    // Skip Mailpit checks when the API is not directly reachable (e.g. behind
    // OAuth2 proxy in prod, or no local Mailpit instance running).
    interface MailpitAddress { Address: string }
    interface MailpitMessage { Subject: string; To: MailpitAddress[] }
    interface MailpitSearchResult { messages: MailpitMessage[] }

    let mailpitOk = false;
    try {
      const probe = await request.get(`${MAILPIT}/api/v1/messages?limit=1`, { timeout: 5000 });
      mailpitOk = probe.ok() && (probe.headers()['content-type'] ?? '').includes('application/json');
    } catch { /* unreachable */ }

    if (mailpitOk) {
      await page.waitForTimeout(2000);

      const mailRes = await request.get(
        `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${reporter}`)}`
      );
      expect(mailRes.ok(), `Mailpit search failed: ${mailRes.status()}`).toBeTruthy();

      const mailData = await mailRes.json() as MailpitSearchResult;
      expect(mailData.messages.length,
        `No email found for ${reporter} in Mailpit`
      ).toBeGreaterThan(0);

      const msg = mailData.messages[0];
      // Subject must contain the ticket ID
      expect(msg.Subject).toContain(ticketId);
      // Must be addressed to the reporter (not only to the info@ BCC)
      expect(
        msg.To.some(t => t.Address === reporter),
        `Email To field does not contain ${reporter}: ${JSON.stringify(msg.To)}`
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
