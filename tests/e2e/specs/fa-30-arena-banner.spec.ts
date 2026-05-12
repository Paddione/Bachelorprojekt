import { test, expect } from '@playwright/test';

const ADMIN_USER = process.env.MENTOLDER_ADMIN_USER!;
const ADMIN_PW   = process.env.MENTOLDER_ADMIN_PW!;
const KORCZ_USER = process.env.KORCZ_USER!;
const KORCZ_PW   = process.env.KORCZ_PW!;

const MENTOLDER_HOME  = 'https://web.mentolder.de/';
const KORCZEWSKI_HOME = 'https://web.korczewski.de/';

test.describe('FA-30 · Arena banner is cross-brand @smoke', () => {

  test('admin opens lobby on mentolder → banner appears on both brands', async ({ browser }) => {
    // Two clean contexts so each gets its own session cookie.
    const ctxAdmin = await browser.newContext();
    const ctxView  = await browser.newContext();
    const adminPage = await ctxAdmin.newPage();
    const viewPage  = await ctxView.newPage();

    // Login admin on mentolder
    await adminPage.goto(MENTOLDER_HOME + 'auth/login?return=/admin/arena');
    await adminPage.getByLabel(/username/i).fill(ADMIN_USER);
    await adminPage.getByLabel(/password/i).fill(ADMIN_PW);
    await adminPage.getByRole('button', { name: /sign in/i }).click();
    await adminPage.waitForURL(/\/admin\/arena/);

    // Login viewer on korczewski
    await viewPage.goto(KORCZEWSKI_HOME + 'auth/login?return=/');
    await viewPage.getByLabel(/username/i).fill(KORCZ_USER);
    await viewPage.getByLabel(/password/i).fill(KORCZ_PW);
    await viewPage.getByRole('button', { name: /sign in/i }).click();
    await viewPage.waitForURL(/web\.korczewski\.de/);

    // Open lobby on mentolder admin page
    await adminPage.getByRole('button', { name: /open lobby/i }).click();
    await adminPage.waitForURL(/\/portal\/arena\?lobby=/);

    // The viewer's korczewski page should now show the banner within ~6s.
    await expect(viewPage.locator('.arena-banner')).toBeVisible({ timeout: 8_000 });
    await expect(viewPage.locator('.arena-banner .eye')).toContainText(/ARENA · LOBBY OPEN/);
    await expect(viewPage.locator('.arena-banner .host em')).toContainText(/./);

    // Dismiss persists per-lobby
    await viewPage.locator('.arena-banner .dismiss').click();
    await viewPage.reload();
    await expect(viewPage.locator('.arena-banner')).toBeHidden({ timeout: 4_000 });

    await ctxAdmin.close();
    await ctxView.close();
  });

});