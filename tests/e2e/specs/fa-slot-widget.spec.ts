import { test, expect } from '@playwright/test';

// SlotWidget is conditionally rendered on the homepage only when CalDAV reports
// available slots. When no slots exist, a "Termine ansehen →" placeholder renders.

test.describe('Slot Widget', () => {
  test('T1 – homepage shows slot widget or availability placeholder', async ({ page }) => {
    await page.goto('/');
    // Either the slot widget (when slots available) or the fallback link is shown
    const widget = page.locator('[data-testid="slot-widget"]');
    const placeholder = page.locator('a[href="/termin"]');
    await expect(widget.or(placeholder).first()).toBeVisible({ timeout: 10_000 });
  });

  test('T2 – /termin passes date/start/end params to booking form', async ({ page }) => {
    // The slot pill href format is /termin?date=...&start=...&end=...
    // Verify /termin preserves these params when redirecting to /kontakt.
    // This is always testable regardless of CalDAV availability.
    await page.goto('/termin?date=2026-12-15&start=09:00&end=09:30');
    await expect(page).toHaveURL(/\/kontakt/);
    await expect(page).toHaveURL(/mode=termin/);
    await expect(page).toHaveURL(/date=2026-12-15/);
  });

  test('T3 – slot URL pre-fills booking form and skips to contact details', async ({ page }) => {
    // Navigate to the booking page with a pre-filled slot (the URL that slot pills generate).
    // With initialStart/initialEnd set, the form should skip slot selection and show contact fields.
    await page.goto('/kontakt?mode=termin&date=2026-12-15&start=09:00&end=09:30');
    // Termin tab should be active
    await expect(page.getByRole('button', { name: /termin buchen/i })).toBeVisible({ timeout: 10_000 });
    // With a pre-selected slot, the contact form fields appear without manual selection
    await expect(page.locator('#b-name').first()).toBeVisible({ timeout: 15_000 });
  });
});
