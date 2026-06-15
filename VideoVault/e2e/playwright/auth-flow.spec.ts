import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
    test('Login and Redirect', async ({ page }) => {
        // Mock successful login
        await page.route('**/api/auth/login', async (route) => {
            await route.fulfill({
                status: 200,
                json: {
                    ok: true,
                    tokens: { accessToken: 'mock-token', refreshToken: 'mock-refresh' },
                    user: { userId: 1, username: 'admin', role: 'ADMIN' },
                },
            });
        });

        // Mock auth status
        await page.route('**/api/auth/status', async (route) => {
            await route.fulfill({ json: { isAdmin: true } });
        });

        // Mock initial state
        await page.route('**/api/videos', async (route) => {
            await route.fulfill({ json: [] });
        });

        await page.goto('/login');

        // Fill login form
        await page.fill('#username', 'admin');
        await page.fill('#password', 'password');

        // Submit
        await page.click('button[type="submit"]');

        // Should redirect to home
        await expect(page).toHaveURL('/');
    });

    test('Login Failure', async ({ page }) => {
        // Mock failed login
        await page.route('**/api/auth/login', async (route) => {
            await route.fulfill({
                status: 401,
                json: { message: 'Invalid credentials' },
            });
        });

        await page.goto('/login');

        await page.fill('#username', 'admin');
        await page.fill('#password', 'wrong_password');
        await page.click('button[type="submit"]');

        // Should show error message
        await expect(page.getByText('Invalid credentials')).toBeVisible();
        await expect(page).toHaveURL(/\/login/);
    });
});
