import { test, expect } from '@playwright/test';
import { adminLogin, createTestInvoice, finalizeInvoiceViaAPI } from '../helpers/billing';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA-21 PR-A: Invoice Lifecycle (Partial/Full Payment)', () => {
  test('partial payment then full payment toggles status', async ({ page, request }) => {
    await adminLogin(page);

    const inv = await createTestInvoice(request, { gross: 100 });
    await finalizeInvoiceViaAPI(request, inv.id);

    // Go to invoice list
    await page.goto(`${BASE}/admin/rechnungen`);
    await expect(page.getByText(inv.number)).toBeVisible();

    // Partial payment 40 via API (simulating the modal result)
    const res1 = await request.post(`${BASE}/api/admin/billing/${inv.id}/payments`, {
      data: { paidAt: '2026-04-28', amount: 40, method: 'bank' },
    });
    expect(res1.status()).toBe(201);

    await page.reload();
    await expect(page.getByText(inv.number).locator('xpath=./..')).toContainText(/Teilbezahlt/i);

    // Final payment 60
    const res2 = await request.post(`${BASE}/api/admin/billing/${inv.id}/payments`, {
      data: { paidAt: '2026-04-29', amount: 60, method: 'bank' },
    });
    expect(res2.status()).toBe(201);

    await page.reload();
    await expect(page.getByText(inv.number).locator('xpath=./..')).toContainText(/Bezahlt/i);
  });

  test('payment overshoot rejected', async ({ request, page }) => {
    // We need login for the API request context to have the right session if BASE is not localhost
    // but typically request context in Playwright doesn't share cookies unless configured.
    // However, createTestInvoice handles auth by being called after login if needed or using direct API.
    
    const inv = await createTestInvoice(request, { gross: 100 });
    await finalizeInvoiceViaAPI(request, inv.id);

    await request.post(`${BASE}/api/admin/billing/${inv.id}/payments`, {
      data: { paidAt: '2026-04-28', amount: 80, method: 'bank' },
    });
    const overshoot = await request.post(`${BASE}/api/admin/billing/${inv.id}/payments`, {
      data: { paidAt: '2026-04-29', amount: 50, method: 'bank' },
    });
    expect(overshoot.status()).toBe(400);
    const text = await overshoot.text();
    expect(text).toMatch(/exceeds outstanding/i);
  });
});
