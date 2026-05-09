import { Page, APIRequestContext, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';
const ADMIN_USER = process.env.ADMIN_USER || process.env.E2E_ADMIN_USER || 'paddione';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.E2E_ADMIN_PASS || '';

export async function adminLogin(page: Page) {
  // Use the OIDC login redirect — works for both local dev and prod.
  await page.goto(`${BASE}/api/auth/login?returnTo=/admin/rechnungen`);

  // Wait for Keycloak login page (URL contains /realms/workspace or /auth/).
  await page.waitForURL(/realms\/workspace|\/auth\//, { timeout: 20_000 });

  // Fill Keycloak credentials.
  await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
  await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS);
  await page.locator('#kc-login, input[type="submit"]').first().click();

  // Wait until we're back on the website.
  await page.waitForURL(/\/admin/, { timeout: 20_000 });
}

export async function createTestInvoice(page: Page, opts: { gross: number }) {
  const email = `test-${Date.now()}@example.de`;

  const res = await page.request.post(`${BASE}/api/admin/billing/create-invoice`, {
    data: {
      name: 'Test Customer',
      email,
      lines: [{ description: 'Test Position', quantity: 1, unitPrice: opts.gross }],
      taxMode: 'kleinunternehmer',
      dueDays: 14,
    }
  });
  expect([200, 201]).toContain(res.status());
  const body = await res.json() as { success?: boolean; data?: { id: string; number: string }; id?: string; number?: string };
  // API returns { success: true, data: { id, number, ... } }
  const invoice = body.data ?? body;
  expect(invoice.id).toBeTruthy();
  return invoice as { id: string; number: string };
}

export async function finalizeInvoiceViaAPI(page: Page, id: string) {
  const res = await page.request.post(`${BASE}/api/admin/billing/${id}/send`, {});
  // 200 = finalized + email sent
  // 502 = finalized but email delivery failed — invoice IS open, test can proceed
  // 404 = already finalized (or wrong id)
  if (res.status() === 502) {
    // Email failed but invoice was finalized — acceptable for testing.
    return;
  }
  if (res.status() === 404) {
    // May already be in open status — proceed anyway.
    return;
  }
  expect([200, 201]).toContain(res.status());
}
