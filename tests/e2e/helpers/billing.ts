import { Page, APIRequestContext, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';
const ADMIN_USER = process.env.ADMIN_USER || 'gekko';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Testpassword123!';

export async function adminLogin(page: Page) {
  await page.goto(`${BASE}/login`);

  // Dismiss "Desktop vs Browser" chooser if present
  const browserLink = page.getByRole('link', { name: /in browser|im browser/i });
  try {
    if (await browserLink.isVisible({ timeout: 2000 })) {
      await browserLink.click();
    }
  } catch {}

  // Keycloak OIDC login
  const ssoButton = page.getByRole('link', { name: /gitlab|openid|keycloak|sso/i });
  if (await ssoButton.isVisible({ timeout: 5000 })) {
    await ssoButton.click();
    await page.waitForURL(/\/realms\/|\/auth\//, { timeout: 10000 });
    await page.locator('#username').fill(ADMIN_USER);
    await page.locator('#password').fill(ADMIN_PASS);
    await page.locator('#kc-login').click();
  } else {
    // Local fallback
    await page.getByRole('textbox', { name: /e-mail|email|benutzername|username/i }).fill(ADMIN_USER);
    await page.getByRole('textbox', { name: /passwort|password/i }).fill(ADMIN_PASS);
    await page.getByRole('button', { name: /sign in|anmelden|log in/i }).click();
  }
  await page.waitForURL(`${BASE}/admin`, { timeout: 15000 });
}

export async function createTestInvoice(request: APIRequestContext, opts: { gross: number }) {
  // First we need a customer.
  const brand = 'test';
  const email = `test-${Date.now()}@example.de`;
  const customerRes = await request.post(`${BASE}/api/admin/clients/create`, {
    data: { brand, name: 'Test Customer', email }
  });
  expect(customerRes.status()).toBe(201);
  const { id: customerId } = await customerRes.json();

  // Now create the invoice
  const res = await request.post(`${BASE}/api/admin/billing/create-invoice`, {
    data: {
      brand,
      customerId,
      issueDate: new Date().toISOString().split('T')[0],
      dueDays: 14,
      taxMode: 'kleinunternehmer',
      lines: [{ description: 'Test Position', quantity: 1, unitPrice: opts.gross }]
    }
  });
  expect(res.status()).toBe(201);
  return await res.json();
}

export async function finalizeInvoiceViaAPI(request: APIRequestContext, id: string) {
  const res = await request.post(`${BASE}/api/admin/billing/${id}/send`, {
    data: { finalizeOnly: true }
  });
  expect(res.status()).toBe(200);
}
