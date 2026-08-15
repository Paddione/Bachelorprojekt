import { test, expect } from '@playwright/test';

test.describe('VideoVault smoke', () => {
  test('loads home and shows header and sidebar', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: 'MediaVault' }).waitFor();
    await expect(page.getByTestId('button-scan-directory')).toBeVisible();
    await expect(page.getByTestId('button-clear-filters')).toBeVisible();
    await expect(page.getByTestId('input-search')).toBeVisible();
  });

  test('theme toggle switches html class', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');

    // Get the initial theme (could be light or dark based on system preference)
    const initialClass = await html.getAttribute('class');
    const initialTheme = initialClass?.includes('dark') ? 'dark' : 'light';

    // Click toggle and verify it switches
    await page.getByTestId('button-theme-toggle').click();
    const expectedTheme = initialTheme === 'dark' ? 'light' : 'dark';
    await expect(html).toHaveClass(new RegExp(expectedTheme));
  });

  test('settings dialog opens', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('button-settings').waitFor();
    await page.getByTestId('button-settings').click();
    await page.getByRole('heading', { name: 'Settings' }).waitFor();
  });

  test('search input accepts text', async ({ page }) => {
    await page.goto('/');
    const input = page.getByTestId('input-search');
    await input.fill('cats');
    await expect(input).toHaveValue('cats');
  });

  test('server health endpoint responds', async ({ page }) => {
    const res = await page.request.get('/api/health');
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('healthy');
  });
});
