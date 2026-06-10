import { defineConfig, devices } from '@playwright/test';

// Playwright config for PR-level E2E runs.
//
// Differences from the main config:
//  - No globalSetup/teardown (no DB purge — safe against prod)
//  - Single browser (chromium only, fast)
//  - No retries (fail fast, give signal immediately)
//  - Shorter timeout (30s)
//  - Only projects that run against the website (no cluster-internal services)
//
// Invoked by .github/workflows/e2e-pr.yml with:
//   npx playwright test --grep "@TAG|@smoke" --config playwright.pr.config.ts
//
// Tag conventions (add to test.describe { tag: ['@tag'] }):
//   @smoke         — always runs on every PR
//   @website       — general website/Astro changes
//   @content-hub   — content hub features
//   @admin         — admin panel
//   @factory       — software factory / dev-status
//   @planungsbuero — Planungsbüro feature
//   @booking       — calendar/booking
//   @meeting       — meeting lifecycle
//   @billing       — billing/invoices
//   @messaging     — chat/messaging
//   @brett         — Systemisches Brett
//   @fragebogen    — questionnaire/fragebogen
//   @crm           — CRM features

const websiteURL = process.env.WEBSITE_URL || 'https://web.mentolder.de';

export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  retries: 0,
  workers: 2,
  reporter: [
    ['line'],
    ['json', { outputFile: '../results/.tmp-e2e-pr-results.json' }],
    ['github'],
  ],
  use: {
    baseURL: websiteURL,
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  },

  projects: [
    // Website (public + authenticated mentolder)
    {
      name: 'mentolder-setup',
      testMatch: '**/mentolder-auth-setup.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        ignoreHTTPSErrors: true,
      },
    },
    {
      name: 'website',
      testMatch: [
        '**/fa-10-*.spec.ts',
        '**/fa-14-*.spec.ts',
        '**/fa-15-*.spec.ts',
        '**/fa-16-*.spec.ts',
        '**/fa-17-*.spec.ts',
        '**/fa-21-*.spec.ts',
        '**/fa-26-*.spec.ts',
        '**/fa-28-*.spec.ts',
        // fa-fragebogen.spec.ts benötigt direkten DB-Zugriff via `pg` — nur nightly

        '**/fa-admin-settings.spec.ts',
        '**/fa-admin-live.spec.ts',
        '**/fa-admin-crm.spec.ts',
        '**/fa-admin-inbox.spec.ts',
        '**/fa-admin-inbox-delete.spec.ts',
        '**/fa-admin-inhalte.spec.ts',
        '**/fa-admin-billing-system.spec.ts',
        '**/fa-admin-tickets.spec.ts',
        '**/fa-admin-monitoring.spec.ts',
        '**/fa-admin-newsletter.spec.ts',
        '**/fa-public-pages.spec.ts',
        '**/fa-41-admin-hub.spec.ts',
        '**/fa-44-platform-health-integrity.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: websiteURL,
      },
    },
    {
      name: 'mentolder',
      dependencies: ['mentolder-setup'],
      testMatch: [
        '**/fa-content-hub-*.spec.ts',
        '**/fa-factory-*.spec.ts',
        '**/fa-planning-office.spec.ts',
        '**/dev-status-tabs.spec.ts',
        '**/fa-admin-knowledge-model-selection.spec.ts',
        '**/sa-21-*.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        ignoreHTTPSErrors: true,
        storageState: '.auth/mentolder-website-admin.json',
      },
    },
  ],

  outputDir: '../results/playwright-traces',
});
