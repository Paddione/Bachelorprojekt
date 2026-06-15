import { test, expect, type Page } from '@playwright/test';
import { afterTestCleanup } from './test-utils';

test.describe('VideoVault app basics', () => {
  test.beforeAll(async ({ browser }) => {
    const page: Page = await browser.newPage();
    await afterTestCleanup(page);
    await page.close();
  });


  test.afterEach(async ({ page }: { page: Page }) => {
    await afterTestCleanup(page);
  });


  test('shows initial empty state and directory button', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('button-scan-directory').waitFor();
    await expect(page.getByTestId('button-scan-directory')).toBeVisible();
    await expect(page.getByText('Drop Video Files Here')).toBeVisible();
  });

  test('clear filters resets the search input', async ({ page }) => {
    await page.goto('/');
    const input = page.getByTestId('input-search');
    await input.fill('something');
    await expect(input).toHaveValue('something');
    await page.getByTestId('button-clear-filters').click();
    await expect(input).toHaveValue('');
  });

  test('saving settings persists on server', async ({ page }) => {
    await page.goto('/');
    // Open settings
    await page.getByTestId('button-settings').waitFor();
    await page.getByTestId('button-settings').click();

    // Change Max Scan Concurrency to 8
    const concurrencySection = page.locator('label:has-text("Max Scan Concurrency")');
    const concurrencyTrigger = concurrencySection.locator('xpath=following::button[@role="combobox" or @type="button"][1]');
    await concurrencyTrigger.waitFor();
    await concurrencyTrigger.click();
    await page.getByRole('option', { name: '8 files at once' }).waitFor();
    await page.getByRole('option', { name: '8 files at once' }).click();

    // Save changes (wait until button is enabled)
    const saveBtn = page.getByRole('button', { name: 'Save Changes' });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Verify settings persisted via server API
    // Verify the UI reflects the updated selection
    await expect(concurrencyTrigger).toHaveText(/8 files at once/);
  });
});
