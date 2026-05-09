import { test, expect } from '@playwright/test';
import { adminLogin, createTestInvoice, finalizeInvoiceViaAPI } from '../helpers/billing';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA-21 PR-A: Invoice Lifecycle (Partial/Full Payment)', () => {
  test('partial payment then full payment toggles status', async ({ page }) => {
    await adminLogin(page);

    const inv = await createTestInvoice(page, { gross: 100 });
    await finalizeInvoiceViaAPI(page, inv.id);

    // Go to invoice list
    await page.goto(`${BASE}/admin/rechnungen`);
    // Invoice numbers are displayed as "#RE-2026-XXXX" in the table.
    await expect(page.getByText(`#${inv.number}`)).toBeVisible();

    // Partial payment 40 via API (simulating the modal result)
    const res1 = await page.request.post(`${BASE}/api/admin/billing/${inv.id}/payments`, {
      data: { paidAt: '2026-04-28', amount: 40, method: 'bank' },
    });
    expect(res1.status()).toBe(201);

    await page.reload();
    // Find the invoice row using the #-prefixed number (unique in the table).
    const invoiceRow = page.locator('tr').filter({ hasText: `#${inv.number}` }).first();
    await expect(invoiceRow).toContainText(/Teilbezahlt/i);

    // Final payment 60
    const res2 = await page.request.post(`${BASE}/api/admin/billing/${inv.id}/payments`, {
      data: { paidAt: '2026-04-29', amount: 60, method: 'bank' },
    });
    expect(res2.status()).toBe(201);

    await page.reload();
    const invoiceRow2 = page.locator('tr').filter({ hasText: `#${inv.number}` }).first();
    await expect(invoiceRow2).toContainText(/Bezahlt/i);
  });

  test('payment overshoot rejected', async ({ page }) => {
    await adminLogin(page); // Need login for session
    
    const inv = await createTestInvoice(page, { gross: 100 });
    await finalizeInvoiceViaAPI(page, inv.id);

    await page.request.post(`${BASE}/api/admin/billing/${inv.id}/payments`, {
      data: { paidAt: '2026-04-28', amount: 80, method: 'bank' },
    });
    const overshoot = await page.request.post(`${BASE}/api/admin/billing/${inv.id}/payments`, {
      data: { paidAt: '2026-04-29', amount: 50, method: 'bank' },
    });
    expect(overshoot.status()).toBe(400);
    const text = await overshoot.text();
    expect(text).toMatch(/exceeds outstanding/i);
  });
});
