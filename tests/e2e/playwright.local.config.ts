import { defineConfig, devices } from '@playwright/test';

const websiteURL = process.env.WEBSITE_URL || 'http://localhost:4321';

export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: websiteURL,
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  },
  projects: [
    // ── website: public & admin website tests ────────────────────
    // Run: WEBSITE_URL=http://localhost:4321 npx playwright test --config playwright.local.config.ts
    // Only includes tests that work against a local dev server.
    // For authenticated or cluster-internal tests, use the main config.
    {
      name: 'website',
      testMatch: [
        '**/fa-01-*.spec.ts',
        '**/fa-04-*.spec.ts',
        '**/fa-05-*.spec.ts',
        '**/fa-10-*.spec.ts',
        '**/fa-14-*.spec.ts',
        '**/fa-15-*.spec.ts',
        '**/fa-16-*.spec.ts',
        '**/fa-17-*.spec.ts',
        '**/fa-20-*.spec.ts',
        '**/fa-21-*.spec.ts',
        '**/fa-26-*.spec.ts',
        '**/fa-28-*.spec.ts',
        '**/fa-public-pages.spec.ts',
        '**/fa-admin-live.spec.ts',
        '**/fa-admin-crm.spec.ts',
        '**/fa-admin-settings.spec.ts',
        '**/fa-admin-inbox.spec.ts',
        '**/fa-admin-inbox-delete.spec.ts',
        '**/fa-admin-inhalte.spec.ts',
        '**/fa-admin-billing-system.spec.ts',
        '**/fa-admin-tickets.spec.ts',
        '**/fa-admin-monitoring.spec.ts',
        '**/fa-admin-newsletter.spec.ts',
        '**/fa-41-admin-hub.spec.ts',
        '**/fa-44-platform-health-integrity.spec.ts',
        '**/fa-57-homepage-hifi-redesign.spec.ts',
        '**/fa-50-*.spec.ts',
        '**/fa-51-*.spec.ts',
        '**/agent-guide-walkthrough.spec.ts',
        '**/a11y-axe.spec.ts',
        '**/fa-54-coaching-sessions.spec.ts',
        '**/fa-55-lmstudio-integration.spec.ts',
        '**/fa-56-admin-assets.spec.ts',
        '**/fa-poll.spec.ts',
        '**/fa-slot-widget.spec.ts',
        '**/fa-client-portal.spec.ts',
        '**/fa-meeting-history.spec.ts',
        '**/fa-document-signing.spec.ts',
        '**/wissensquellen.spec.ts',
        '**/fa-bug-*.spec.ts',
        '**/integration-smoke.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: websiteURL,
      },
    },
  ],
  outputDir: '../results/playwright-traces',
});
