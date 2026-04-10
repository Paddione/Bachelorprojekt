import { test as setup, expect } from '@playwright/test';

const MM_USER = process.env.MM_TEST_USER || 'testuser1';
const MM_PASS = process.env.MM_TEST_PASS || 'Testpassword123!';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');

  // Dismiss "Desktop vs Browser" chooser if present (URL is /landing#/login)
  const browserLink = page.getByRole('link', { name: /in browser|im browser/i });
  try {
    await browserLink.waitFor({ state: 'visible', timeout: 5_000 });
    await browserLink.click();
  } catch {
    // Already on login form — no chooser shown
  }

  // Check if SSO/OIDC login is available (GitLab button = Keycloak OIDC)
  const ssoButton = page.getByRole('link', { name: /gitlab|openid|keycloak|sso/i });
  const emailField = page.getByRole('textbox', { name: /e-mail|email|benutzername|username/i });

  // Wait for login page to load
  await expect(emailField).toBeVisible({ timeout: 10_000 });

  if (await ssoButton.isVisible()) {
    // SSO flow: click the OIDC button → Keycloak login page
    await ssoButton.click();
    await page.waitForURL(/\/realms\/|\/auth\//, { timeout: 10_000 });

    // Fill in Keycloak login form
    const kcUser = page.locator('#username');
    const kcPass = page.locator('#password');
    await expect(kcUser).toBeVisible({ timeout: 10_000 });
    await kcUser.fill(MM_USER);
    await kcPass.fill(MM_PASS);
    await page.locator('#kc-login').click();
  } else {
    // Local login flow (dev/k3d environments)
    await emailField.fill(MM_USER);
    await page.getByRole('textbox', { name: /passwort|password/i }).fill(MM_PASS);
    await page.getByRole('button', { name: /sign in|anmelden|log in/i }).click();
  }

  await page.waitForURL('**/channels/**', { timeout: 20_000 });
  await expect(page.locator('#channel_view')).toBeVisible({ timeout: 10_000 });

  // Disable remaining tour tips via user preferences (server-level config handles the main flow)
  await page.evaluate(async () => {
    const meResp = await fetch('/api/v4/users/me');
    const me = await meResp.json();
    await fetch(`/api/v4/users/${me.id}/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify([
        { user_id: me.id, category: 'tutorial_step', name: me.id, value: '999' },
        { user_id: me.id, category: 'crt_thread_pane_step', name: me.id, value: '999' },
        { user_id: me.id, category: 'onboarding_task_list', name: 'onboarding_task_list_show', value: 'false' },
        { user_id: me.id, category: 'onboarding_task_list', name: 'onboarding_task_list_open', value: 'false' },
        { user_id: me.id, category: 'recommended_next_steps', name: 'hide', value: 'true' },
        { user_id: me.id, category: 'insights', name: 'insights_tutorial_state', value: '{"insights_modal_viewed":true}' },
      ]),
    });
  });
  // Reload to apply clean UI
  await page.reload();
  await expect(page.locator('#channel_view')).toBeVisible({ timeout: 10_000 });

  await page.context().storageState({ path: '.auth/user.json' });
});
