import { Page } from '@playwright/test';

/**
 * Dismiss Mattermost tour tips and onboarding overlays that block pointer events.
 * Call after each page.goto() in Mattermost tests.
 */
export async function dismissOverlays(page: Page): Promise<void> {
  // Inject CSS that disables pointer-events on tour/onboarding overlays
  await page.addStyleTag({
    content: `
      .tour-tip__overlay,
      .tour-tip__backdrop,
      [data-cy="onboarding-task-list-overlay"] {
        pointer-events: none !important;
        opacity: 0 !important;
      }
    `,
  });

  // Dismiss any visible tooltip/tour buttons (e.g. "Entwürfe NEU", "Nicht jetzt")
  for (const label of [/nicht jetzt/i, /skip/i, /dismiss/i]) {
    const btn = page.getByRole('button', { name: label });
    try {
      await btn.waitFor({ state: 'visible', timeout: 2_000 });
      await btn.click();
      await page.waitForTimeout(300);
    } catch {
      // Button not present
    }
  }
}

/** Navigate to a Mattermost channel by URL slug (more reliable than Quick Switcher) */
export async function goToChannel(page: Page, teamSlug: string, channelSlug: string): Promise<void> {
  await page.goto(`/${teamSlug}/channels/${channelSlug}`);
  await dismissOverlays(page);
  await page.locator('#post_textbox, [data-testid="post_textbox"]').waitFor({ state: 'visible', timeout: 20_000 });
}

/** Navigate to a DM with a user by URL */
export async function goToDM(page: Page, teamSlug: string, username: string): Promise<void> {
  await page.goto(`/${teamSlug}/messages/@${username}`);
  await dismissOverlays(page);
  await page.locator('#post_textbox, [data-testid="post_textbox"]').waitFor({ state: 'visible', timeout: 20_000 });
}
