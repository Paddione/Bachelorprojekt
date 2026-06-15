import { test, expect } from '@playwright/test';

test.describe('Help Screen', () => {
  test('help button is visible on the page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('help-button')).toBeVisible();
  });

  test('clicking help button opens the help dialog', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('help-button').click();
    await page.getByTestId('help-dialog').waitFor();
    await expect(page.getByTestId('help-dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Help Guide' })).toBeVisible();
  });

  test('help dialog shows all 10 navigation sections', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('help-button').click();
    await page.getByTestId('help-dialog').waitFor();

    const expectedSections = [
      'Getting Started', 'Scanning & Importing', 'Browsing Your Library',
      'Filtering & Search', 'Tags & Categories', 'Focus Mode',
      'Duplicate Detection', 'Media Types', 'Analytics & Stats', 'Settings',
    ];

    for (const section of expectedSections) {
      await expect(page.getByRole('button', { name: section })).toBeVisible();
    }
  });

  test('clicking a nav section shows its content', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('help-button').click();
    await page.getByTestId('help-dialog').waitFor();

    const content = page.getByTestId('help-content');

    // Default: Getting Started
    await expect(content.getByRole('heading', { name: 'Getting Started' })).toBeVisible();
    await expect(content.locator('li')).not.toHaveCount(0);

    // Switch to Scanning & Importing
    await page.getByRole('button', { name: 'Scanning & Importing' }).click();
    await expect(content.getByRole('heading', { name: 'Scanning & Importing' })).toBeVisible();
    await expect(content.getByText(/Scan Directory/)).toBeVisible();

    // Switch to Focus Mode
    await page.getByRole('button', { name: 'Focus Mode' }).click();
    await expect(content.getByRole('heading', { name: 'Focus Mode' })).toBeVisible();
  });

  test('help dialog can be closed via close button', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('help-button').click();
    await page.getByTestId('help-dialog').waitFor();

    // shadcn Dialog uses an X close button with specific class
    await page.locator('[data-testid="help-dialog"] button[class*="close"], [data-testid="help-dialog"] button:has(svg.lucide-x)').click();
    await expect(page.getByTestId('help-dialog')).not.toBeVisible();
  });

  test('help dialog can be closed with Escape key', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('help-button').click();
    await page.getByTestId('help-dialog').waitFor();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('help-dialog')).not.toBeVisible();
  });

  test('all sections render content without errors', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('help-button').click();
    await page.getByTestId('help-dialog').waitFor();

    const content = page.getByTestId('help-content');

    // Get all sidebar nav buttons (desktop sidebar)
    const navButtons = page.locator('nav button');
    const count = await navButtons.count();
    expect(count).toBe(10);

    for (let i = 0; i < count; i++) {
      await navButtons.nth(i).click();
      // Verify each section renders list items
      await expect(content.locator('li')).not.toHaveCount(0);
      // Verify heading is present
      const heading = content.locator('h3');
      await expect(heading).toBeVisible();
    }
  });
});
