import { Page, APIRequestContext, expect } from '@playwright/test';
import { loginViaE2E, getAdminCredentials } from '../lib/auth';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

export async function adminLogin(page: Page, request?: APIRequestContext, testInfo?: any) {
  const { user } = getAdminCredentials();
  await loginViaE2E(page, BASE, user, '/admin/rechnungen');
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
  if (res.status() === 502) {
    // Email failed but invoice was finalized — acceptable for testing.
    return;
  }
  expect([200, 201]).toContain(res.status());
}
